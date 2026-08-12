# Scala 语法速查表

> 一页参考,贴墙上。建议打印。

## 1. 类型与字面量

| 字面量 | 类型 | 备注 |
|--------|------|------|
| `42` | Int | |
| `42L` | Long | |
| `3.14` | Double | |
| `3.14f` | Float | |
| `'a'` | Char | |
| `true` / `false` | Boolean | |
| `"hi"` | String | |
| `s"$x + $y"` | String | 插值 |
| `f"pi=$pi%.3f"` | String | 格式化 |
| `raw"a\nb"` | String | 不转义 |
| `1_000_000` | Int | 数字分隔 |
| `0xFF` | Int | 十六进制 |
| `0b1010` | Int | 二进制 |
| `null` | Null | 避免使用 |
| `()` | Unit | "无值" |
| `???` | Nothing | 永不返回 |

## 2. 变量与常量

```scala
val x = 42        // 不可变(优先)
var y = 0         // 可变(尽量避免)
val z: Double = 1.0  // 显式标注
```

## 3. 控制结构

```scala
// if 表达式
val s = if cond then "yes" else "no"

// for 推导
for
  x <- xs
  y <- ys if y > 0
yield x + y

// while
var i = 0
while i < 10 do i += 1

// 模式匹配
x match
  case 0      => "zero"
  case n: Int => s"int $n"
  case s: String => s"str $s"
  case List(1, _*) => "starts with 1"
  case (a, b) => s"tuple $a $b"
  case _      => "other"
```

## 4. 函数与方法

```scala
// 顶层函数
def add(a: Int, b: Int): Int = a + b

// 默认参数
def greet(name: String, greeting: String = "Hello") = s"$greeting, $name"

// 命名参数
greet(name = "ada", greeting = "Hi")

// 变参
def sum(xs: Int*): Int = xs.sum

// 柯里化
def curried(a: Int)(b: Int): Int = a + b
val add5: Int => Int = curried(5)

// 按名参数
def unless(c: Boolean)(body: => Unit): Unit = if !c then body

// 过程语法(Scala 3 强制 Unit = ...)
def log(msg: String): Unit = println(msg)
```

## 5. 类与对象

```scala
// 主构造器
class Person(val name: String, var age: Int):
  def greet: String = s"Hi, I'm $name"

// 继承
class Employee(name: String, age: Int, val salary: Double) extends Person(name, age)

// object(单例)
object Person:
  def apply(name: String): Person = new Person(name, 0)

// case class
case class Point(x: Int, y: Int)

// case object
case object Origin

// 伴生
class C private (val v: Int)
object C:
  def apply(v: Int): C = new C(v)
```

## 6. 特质

```scala
trait Logged:
  def log(msg: String): Unit = println(s"[log] $msg")

trait Timestamp extends Logged:
  abstract override def log(msg: String): Unit =
    super.log(s"${System.currentTimeMillis()} $msg")

class Service extends Timestamp
```

## 7. ADT 与枚举

```scala
// sealed trait + case class(Scala 2/3 通用)
sealed trait Shape
case class Circle(r: Double)      extends Shape
case class Rectangle(w: Double, h: Double) extends Shape

// Scala 3 enum
enum Color:
  case Red, Green, Blue

// 带参数 enum
enum Json:
  case JNull
  case JStr(s: String)
  case JArr(items: List[Json])
```

## 8. 隐式 / given

```scala
// Scala 2
implicit val ec: ExecutionContext = ...
def work()(implicit ec: ExecutionContext): Unit = ...
implicitly[ExecutionContext]

// Scala 3
given ec: ExecutionContext = ...
def work()(using ec: ExecutionContext): Unit = ...
summon[ExecutionContext]
```

## 9. 类型类

```scala
trait Show[A]:
  def show(a: A): String

object Show:
  given Show[Int] = _.toString
  given [A: Show] as Show[List[A]] = _.map(show)

// 调用
def show[A: Show](a: A): String = summon[Show[A]].show(a)
```

## 10. 扩展方法

```scala
// Scala 2
implicit class StringOps(val s: String) extends AnyVal:
  def toSnake: String = ...

// Scala 3
extension (s: String)
  def toSnake: String = ...
```

## 11. 集合

```scala
List(1, 2, 3)           // 不可变链表
Vector(1, 2, 3)          // 不可变索引序列(O(log32 n))
Set(1, 2, 3)             // 不可变集合
Map("a" -> 1)            // 不可变哈希
(1 to 10).toList         // Range
List(1, 2, 3).map(_ * 2) // [2, 4, 6]
List(1, 2, 3).filter(_ > 1)
List(1, 2, 3).foldLeft(0)(_ + _)
List(1, 2, 3).reduce(_ + _)
```

## 12. Option / Either / Try

```scala
val o: Option[Int] = Some(42)
o.map(_ + 1)
o.getOrElse(0)
o.fold("none")("got " + _)

val e: Either[String, Int] = Right(42)
e.map(_ + 1)
e.left.map(s => s"error: $s")

import scala.util.{Try, Success, Failure}
val t: Try[Int] = Try(riskyOp())
t.recover { case _: Throwable => 0 }
```

## 13. 模式匹配速记

| 模式 | 含义 |
|------|------|
| `_` | 通配符 |
| `x` | 变量绑定 |
| `Foo(x, y)` | 构造器解构 |
| `x: T` | 类型模式 |
| `1 \| 2 \| 3` | 多选一 |
| `xs @ List(1, _*)` | 命名绑定 |
| `case x if x > 0` | 守卫 |
| `case Some(x) => ...` | Some 解构 |
| `case head :: tail => ...` | 列表 cons |

## 14. for 推导翻译

```scala
for
  x <- xs              // xs.flatMap { x =>
  y <- ys              //   ys.flatMap { y =>
  if cond              //     if cond then
yield x + y            //       Some(x + y) else Iterator.empty
                       //     }
                       //   }
                       // }
```

## 15. 控制抽象(when / unless / defer)

```scala
def when[A](cond: Boolean)(body: => A): Option[A] =
  if cond then Some(body) else None

def unless(cond: Boolean)(body: => Unit): Unit =
  if !cond then body

def defer(action: => Unit): () => Unit = () => action
```

## 16. 常用注解

| 注解 | 用途 |
|------|------|
| `@deprecated` | 弃用警告 |
| `@inline` | 提示内联 |
| `@tailrec` | 尾递归检查 |
| `@specialized` | 泛型特化 |
| `@implicitNotFound` | 隐式未找到的错误信息 |
| `@nowarn` | 静默警告 |
| `@unchecked` | 抑制模式匹配警告 |
| `@experimental` | 实验性 API |

## 17. Scala 2 → 3 关键替换

| Scala 2 | Scala 3 |
|---------|---------|
| `implicit val x: T = ...` | `given x: T = ...` |
| `(implicit ev: T)` | `(using ev: T)` |
| `implicitly[T]` | `summon[T]` |
| `implicit class` | `extension` |
| `package object` | 顶级定义 + `export` |
| `object X extends Enumeration` | `enum X:` |
| `({type L[a] = F[G[a]]})#L` | `[A] =>> F[G[A]]` |
| `def f(x: T) { body }` | `def f(x: T): Unit = body` |
| `if (x) y` | `if x then y` |

## 18. 命名约定

| 类型 | 风格 | 例 |
|------|------|-----|
| 类 / 特质 | PascalCase | `List`, `Functor` |
| 方法 / 值 | camelCase | `map`, `headOption` |
| 常量 | PascalCase | `MaxValue` |
| 类型参数 | A, B, F, T | 单字母大写 |
| 隐式 / given | 描述性 | `showInt`, `orderingForList` |
| 包 | 全小写 | `com.learning.collections` |
