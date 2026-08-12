# M02 函数深度

> Phase 1 模块。函数是 Scala 的"一等公民",理解函数就是理解 Scala。
> 本文档深入到类型签名层面。

## 1. 函数类型 `FunctionN`

Scala 中,函数值是 `FunctionN[A1, ..., AN, R]` 的实例。N 从 0 到 22。

```scala
val f0: () => Int = () => 42
val f1: Int => Int = x => x + 1
val f2: (Int, String) => Boolean = (n, s) => s.length == n
val f3: (Int, Int, Int) => Int = _ + _ + _  // 不推荐,可读性差
```

**注意**:函数类型 `A => B` 等价于 `Function1[A, B]`,它默认是 `Function1[-A, +B]`:
- 输入参数**逆变**(`-A`):如果 `A2 <: A1`,则 `Function1[A1, B] <: Function1[A2, B]`。因为能用 `Animal` 处理的函数,一定能用 `Cat` 处理
- 输出参数**协变**(`+B`):如果 `B1 <: B2`,则 `Function1[A, B1] <: Function1[A, B2]`。能产生 `Cat` 的函数,一定能产生 `Animal`

```scala
val animalPrinter: Animal => String = _.toString
val catPrinter: Cat => String = animalPrinter  // OK,A2=Cat <: A1=Animal
```

## 2. 方法 vs 函数值

```scala
def m(x: Int): Int = x + 1         // 方法(method)
val f: Int => Int = (x: Int) => x + 1  // 函数值(function value)
val g: Int => Int = m _              // Eta 展开:方法转函数
val h: Int => Int = m                // Scala 2.13+ / 3 自动 eta 展开
```

**差异**:
- 方法不在堆上分配,是编译期概念
- 函数值每次创建会分配(除非是 final class 的实例)
- 方法不能被当作值传递;函数值可以
- 自动 eta 展开让两者在大多数场景下等价

**性能**:
```scala
// 每秒调用 100 万次时,二者性能差异通常 < 1%
// 不要为了"避免分配"而写 eta 展开显式语法
```

## 3. 默认参数与命名参数

```scala
def connect(host: String, port: Int = 8080, timeout: Int = 5000): Unit = ...

connect("localhost")                       // 端口 8080,超时 5000
connect("localhost", port = 9090)          // 命名参数
connect("localhost", timeout = 10000)      // 跳过 port
connect("localhost", 9090, 10000)          // 全位置
```

**陷阱**:
```scala
// 默认参数每次调用都会求值(除非是 val)
def now(): Long = System.currentTimeMillis()
def f(x: Long = now()): Long = x
// 两次调用 f() 返回相同值吗?
// 不,now() 在每次调用 f() 时被求值
```

**互操作性**:
默认参数被编译器合成为多个方法。Java 看不到默认参数,只能调用合成方法。

## 4. 变参

```scala
def sum(xs: Int*): Int = xs.sum
sum()                  // 0
sum(1, 2, 3)           // 6
sum(List(1, 2, 3)*)    // 解构:6
```

**注意**:变参是 `Seq[T]`,不是 `List[T]`。在递归中要小心:

```scala
def sum(xs: Int*): Int =
  if xs.isEmpty then 0
  else xs.head + sum(xs.tail*)  // 必须用 :_*
```

**Scala 3 中,inline 函数的变参限制**:
inline def 不能在内部把 `xs: Int*` 当字面量展开。Scala 3.3 之前要避开这个。

## 5. 柯里化与偏应用

```scala
def add(a: Int)(b: Int): Int = a + b
val add5: Int => Int = add(5)         // 偏应用
add(3)(4)                              // 7
add5(10)                               // 15
```

**为什么柯里化?**

1. **隐式解析**:多参数列表能让编译器分别在不同作用域中解析每一组
2. **类型推断**:每组参数独立推断,前组结果可影响后组
3. **DSL 风格**:让函数像关键字一样可读
4. **可组合**:`(f andThen g)(x)` 等价于 `g(f(x))`

```scala
// 经典例子:trait 上的 curry
trait Semigroup[A]:
  def combine(a: A, b: A): A

// 改成 curry 后,可以使用 `combine _` 拿到部分应用函数
def combineAll[A](xs: List[A])(using s: Semigroup[A]): A =
  xs.reduce(s.combine)
```

## 6. 按名参数

```scala
def unless(cond: Boolean)(body: => Unit): Unit =
  if !cond then body

var count = 0
unless(true) { count += 1 }
// count == 0,因为 block 没有被求值
```

**`=> Unit` vs `() => Unit`**:

- `body: => Unit`:每次访问 `body` 都重新求值
- `body: () => Unit`:`body` 是一个 thunk,需要 `body()` 触发

```scala
def byName(x: => Int): Int = x + x    // x 求值两次
def byValue(x: () => Int): Int = x() + x()  // thunk 调用两次

var n = 0
def inc(): Int = { n += 1; n }
byName(inc)   // n = 2(inc 被求值两次)
byValue(inc)  // n = 4(thunk 调用两次,每次 inc 都执行)
```

**按名 vs 懒值**:
- `lazy val`:首次访问时求值,缓存结果
- `def`:每次访问都重新求值
- `by-name`:在参数位置表现同 def,作用域是参数内

## 7. `using` 与上下文参数链

Scala 3 的 `using` 把隐式参数从语法糖提升为一等公民。

```scala
trait Show[A]:
  def show(a: A): String

def showAll[A: Show](xs: List[A]): String =
  xs.map(show).mkString(", ")
```

等价的非简写形式:
```scala
def showAll[A](xs: List[A])(using ev: Show[A]): String =
  xs.map(ev.show).mkString(", ")
```

**多组 using**:
```scala
def render[A, B](a: A, b: B)(using sa: Show[A], sb: Show[B]): String =
  s"${sa.show(a)} and ${sb.show(b)}"

// 调用:render(1, "x")  // 自动从作用域拉取 Show[Int] 和 Show[String]
```

**`using` 的好处**:
- 调用方必须**显式** import given
- 错误信息更友好
- `summon[T]` 比 `implicitly[T]` 名字更准确

## 8. 控制抽象

让函数接受"代码块"作为参数,做出 `when` / `unless` / `defer` 这样的 DSL。

```scala
// when
def when[A](cond: Boolean)(body: => A): Option[A] =
  if cond then Some(body) else None

when(true) {
  println("computing...")
  42
}  // Some(42)

// defer —— 把 eager 副作用延迟到 lazy 时机
def defer(action: => Unit): () => Unit = () => action

val task = defer { println("later") }
task()  // 现在才执行
```

## 9. 函子规律与法律

Scala 函数不是 functor,但 `Function1[-A, +B]` 可以视作"`A` 上的 reader functor":

```scala
// 任意函数 f: A => B,可以:
val f: Int => String = _.toString
// 1. map 改变输出
val g: Int => Double = f.map(_.length)
// 2. 通过 andThen / compose 串联
val h: Int => Boolean = (_: Int).toString.andThen(_.length > 1)
```

## 10. 实操:写一个 curry 化的配置读取器

```scala
case class Config(dbUrl: String, port: Int, user: String)

def makeConfig(dbUrl: String)(port: Int = 5432)(user: String): Config =
  Config(dbUrl, port, user)

val dev = makeConfig("localhost")("dev_user")             // 端口默认 5432
val prod = makeConfig("prod.db")(_)(user = "prod_user")  // 命名参数
```

**为什么这样写?**
- 不同环境的连接参数可能不同 → 偏应用生成"局部函数"
- `using Config` 让所有用到配置的函数自动拿到它 → 隐式注入

## 11. 检查清单

- [ ] 解释 `Function1[-A, +B]` 的型变方向
- [ ] 写出 eta 展开与方法转函数
- [ ] 解释 by-name 与 thunk 的差异
- [ ] 写出 `using` 与上下文约束的等价
- [ ] 写一个 `when` / `unless` / `defer` 的 DSL
- [ ] 解释多参数列表的 3 个真实用途
