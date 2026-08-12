# M21 性能与 JVM 互操作

> Phase 3 高级模块。写出"和 Java 一样快"的 Scala 代码,需要理解 JVM 与 Scala 编译器的 trick。

## 1. 装箱 (Boxing)

**核心问题**:泛型类型擦除(`List[Int]` 内部存 `java.lang.Integer`)有性能损失。

```scala
// 反例:无 @specialized,运行时大量装箱
def add(xs: List[Int]): Int = xs.foldLeft(0)(_ + _)
// 内部:head 返回 Integer, _ + _ 要拆箱

// 改进:用 @specialized 的类型类
trait Adder[@specialized(Int, Long, Double) T]:
  def zero: T
  def add(a: T, b: T): T
```

**Scala 3 的改进**:
- `Int`、`Double` 等有专门的 `IntMap`、`DoubleMap` 集合(无装箱)
- `scala.runtime.RichInt` 仍然装箱,但用户用得少

## 2. @specialized 详解

```scala
class Box[@specialized(Int, Long, Double) T](val value: T)

// 编译器生成 4 个 Box 类:
// Box$mcI$sp (Int)
// Box$mcJ$sp (Long)
// Box$mcD$sp (Double)
// Box[T]      (其他)
```

**实战建议**:
- 数据结构的元素类型:`List[@specialized T]`、`Set[@specialized T]`
- 数值运算:`Adder[@specialized(Int, Long, Double) T]`
- **不要**给所有类型都加 `@specialized`:每个特化都生成一个类,字节码膨胀

## 3. 不可变集合的"分配"问题

每次 `xs :+ x` 都创建新集合。100 万次 append,内存可能爆。

**实战解法**:
```scala
// 反例:大量 List append
val xs = (1 to 1_000_000).foldLeft(List.empty[Int])(_ :+ _)
// 性能极差,每次都是 O(n) 复制

// 正例:ListBuffer 收集
val xs = (1 to 1_000_000).foldLeft(ListBuffer.empty[Int])(_ += _).toList
// O(n) 总时间

// 正例:用 Vector 替代 List
val xs = (1 to 1_000_000).foldLeft(Vector.empty[Int])(_ :+ _)
// O(n log32 n),远快于 List
```

**Vector 在 append 上比 List 好 100x**。原因:`Vector` 是 32-way 树,append 是 O(log32 n);`List` 是单链表,append 是 O(n)。

## 4. 尾递归

```scala
def sum(xs: List[Int]): Int = xs match
  case Nil     => 0
  case h :: t  => h + sum(t)
// ^ 不尾递归!`h + sum(t)` 是"先递归再相加"
```

```scala
@tailrec
def sum(xs: List[Int], acc: Int = 0): Int = xs match
  case Nil     => acc
  case h :: t  => sum(t, acc + h)
// ^ 尾递归,编译器优化为 while 循环,栈安全
```

**实战**:
- 永远用 `@tailrec` 标注递归
- 编译器会**检查**这是真尾递归,否则**报错**
- `foldLeft` / `foldRight` 内部就是尾递归

**深度优先的递归**:
```scala
// 反例:树深 10 万,栈溢出
def depth(t: Tree[Int]): Int = t match
  case Leaf(_)        => 1
  case Branch(l, r)   => 1 + math.max(depth(l), depth(r))

// 正例:用 foldLeft 或 cats Eval.trampoline
import cats.Eval
def depth(t: Tree[Int]): Eval[Int] = t match
  case Leaf(_)        => Eval.now(1)
  case Branch(l, r)   => (depth(l), depth(r)).mapN((a, b) => 1 + math.max(a, b))
```

## 5. lazy val 的陷阱

```scala
lazy val expensive: BigDecimal = {
  println("computing...")
  scala.util.Random.nextDouble()
}

expensive  // 第一次访问,执行
expensive  // 之后访问,用缓存
```

**陷阱 1:线程安全 + 双重检查锁**

Scala 的 `lazy val` 在多线程下用**双重检查锁**,安全但有性能成本。
**解法**:用 `@volatile` + `Option`,或者用 cats-effect 的 `Ref`。

**陷阱 2:初始化顺序**

```scala
object A:
  val x: Int = B.y + 1
object B:
  lazy val y: Int = 1
// A.x 的初始化可能访问未初始化的 B.y
```

**解法**:用 `lazy val` 而非 `val`:
```scala
object A:
  lazy val x: Int = B.y + 1
```

## 6. 字符串拼接

```scala
// 反例:O(n²) 的字符串拼接
var s = ""
for x <- xs do s = s + x

// 正例:用 StringBuilder
val sb = StringBuilder()
for x <- xs do sb.append(x)
sb.toString

// 更好:用 mkString
xs.mkString("")

// 更好:用 StringJoiner
xs.mkString("[", ",", "]")
```

## 7. JVM 互操作

### 调用 Java

```scala
import java.util.{ArrayList, HashMap}

val list = new ArrayList[String]()
list.add("a")
list.add("b")

// 隐式转换(Java 集合 <-> Scala 集合)
import scala.jdk.CollectionConverters.*
list.asScala          // Scala 视角的 ArrayList
val scalaList = list.asScala.toList
```

### 暴露给 Java

```scala
class MyService:
  def hello(name: String): String = s"Hello, $name"

object MyService:
  @annotation.static def newInstance: MyService = new MyService
```

**Java 调用 Scala**:
- `def hello(name: String)` 编译为 `String hello(String name)`
- `def hello(name: String*): String` 编译为 `String hello(scala.collection.Seq<String> name)`(不直观!)

**实战**:
- 对外暴露 API 时,避免用 `*` 变参
- 用 `@BeanProperty` 让 Java 看到 getXxx/setXxx
- 用 `@varargs` 让 Java 看到真正的变参

## 8. Java 集合 <-> Scala 集合

```scala
import scala.jdk.CollectionConverters.*

val javaList = java.util.List.of(1, 2, 3)
val scalaList: List[Int] = javaList.asScala.toList
// 或 val scalaBuffer = javaList.asScala  (可变)

val scalaMap = Map("a" -> 1)
val javaMap: java.util.Map[String, Int] = scalaMap.asJava
```

**实战**:
- 在 Scala 中用 Scala 集合
- 只在 Java API 边界用 `asJava` / `asScala`

## 9. 字节码级别的优化

```scala
// final 修饰的 method,编译器可以做单态化
final def add(a: Int, b: Int): Int = a + b
// 编译为 invokestatic (静态调用),比 invokevirtual (虚调用) 快

// 同样的逻辑:final class
final class Money(val amount: BigDecimal, val currency: String)
// 不会被继承,所有调用可单态化
```

**Scala 3 的 `open`** 反过来:**默认 final,需要 `open` 才能继承**。

## 10. JMH 基准测试

```scala
import org.openjdk.jmh.annotations.*

@State(Scope.Benchmark)
class ListBench:
  val xs: List[Int] = (1 to 10000).toList

  @Benchmark
  def sumFold(): Int = xs.foldLeft(0)(_ + _)

  @Benchmark
  def sumRec(): Int = sum0(xs)
  def sum0(xs: List[Int]): Int = xs match
    case Nil    => 0
    case h :: t => h + sum0(t)
```

**写基准时**:
- 用 JMH,而不是 `System.currentTimeMillis`
- 预热、迭代、统计
- 报告标准差

## 11. 编译器选项

```scala
scalacOptions ++= Seq(
  "-deprecation",          // 弃用警告
  "-feature",              // 语言特性警告
  "-unchecked",            // unchecked 警告
  "-Xlint",                // 更多警告
  "-Werror",               // 警告视为错误
  "-Yexplicit-nulls",     // Scala 3,显式 nullability
  "-Wsafe-init",           // Scala 3,字段初始化检查
)
```

**生产建议**:
- 打开所有警告
- 把警告视为错误
- 但允许 `-Wconf cat=unused:info`(unused 别 error,会刷屏)

## 12. 检查清单

- [ ] 解释 boxing 的代价与 @specialized
- [ ] 写一个 `@tailrec` 的累加
- [ ] 解释 `lazy val` 的线程安全实现
- [ ] 用 `StringBuilder` / `mkString` 优化字符串拼接
- [ ] 用 `scala.jdk.CollectionConverters` 转换 Java/Scala 集合
- [ ] 写一个 JMH 基准测试
- [ ] 解释 Scala 3 默认 final 的优化价值
