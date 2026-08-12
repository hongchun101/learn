# M01 基础类型深度

> Phase 1 模块。M01 在入门阶段占核心地位。
> 本文档为深度补充,讲解类型层级、值类、opaque type、字面量后缀、`Nothing` 等细节。

## 1. 类型层级全景

```
                Any
               /  \
        AnyVal    AnyRef (= java.lang.Object)
        /    \         \
    Int  Double   ...    String  List  Map  ...
     |     |              |
   Nothing <- 一切子类型都有 Nothing <: T <: Any
   Null   <- 所有引用类型有 Null <: T <: AnyRef
```

**要点**:

- `Any` 是所有类型的**父类**,有两个值:`null` 和 `()`
- `AnyVal` 是值类型父类(Int, Long, Double, Boolean, Char, Unit, ...)。值类型的实例在 JVM 上对应原始类型(`int`, `long`, ...)
- `AnyRef` 是引用类型父类(类、特质、集合、String, ...)。对应 `java.lang.Object`
- `Nothing` 是**所有类型的子类**,可以赋给任何变量。用作"永不返回"标记(`throw`, `???`, `sys.error`)
- `Null` 是**所有引用类型的子类**,只有 `null` 一个值。**生产代码中应避免使用**
- `Unit` 是值类型,只有 `()` 一个值。类似 Java 的 `void`,但 `Unit` 是真正的类型(有 `==`、可作为类型参数)

```scala
def fail(msg: String): Nothing = throw new RuntimeException(msg)
val x: Int = fail("boom")  // OK,因为 Nothing <: Int
```

## 2. 字面量的所有后缀

```scala
42        // Int
42L       // Long
42l       // Long(但不要用,像 1l 像 11)
3.14      // Double
3.14f     // Float
3.14D     // Double
3.14d     // Double
'a'       // Char
"hi"      // String
true      // Boolean
42`       // Symbol(Scala 2;Scala 3 仍可用)
```

数字字面量下划线分隔(2.13+):
```scala
1_000_000        // 1000000
3.141_592_653    // 3.141592653
0xFF_FF_FF       // 16777215
```

## 3. 字符串插值

Scala 字符串插值由 `StringContext` 的方法实现。`s""`、`f""`、`raw""` 是内置的。

```scala
val name = "ada"
val age = 36
s"name=$name, age=$age"           // "name=ada, age=36"
s"1+1=${1 + 1}"                   // "1+1=2"
f"age=$age%04d"                   // "age=0036"
f"pi=${math.Pi}%.3f"              // "pi=3.142"
raw"a\nb"                         // "a\\nb"(不转义)
```

**自定义插值器**:
```scala
import scala.util.Try
extension (sc: StringContext)
  def safeInt(args: Any*): Option[Int] =
    Try(sc.s(args: _*).toInt).toOption

val safeInt"42"   // Some(42)
val safeInt"abc"  // None
```

## 4. 值类 vs opaque type 详细对比

### Scala 2 值类

```scala
final class UserId(val raw: Long) extends AnyVal {
  override def toString: String = s"UserId($raw)"
}
```

- 编译期消除包装,运行时是 `Long`
- 限制:
  - 必须只有一个 `val` 主构造参数
  - 不能扩展除 `AnyVal` 外的 trait
  - 不能在类型参数位置(`List[UserId]` 在某些情况下会装箱)
  - 不能有辅助构造器
  - 字段必须是 `val` 不是 `var`

### Scala 3 opaque type

```scala
object UserIdModule:
  opaque type UserId = Long
  object UserId:
    def apply(raw: Long): UserId       = raw
    extension (id: UserId) def raw: Long = id
```

- **文件内**:`UserId` 与 `Long` 完全等价(可以直接 `id + 1L`)
- **文件外**:`UserId` 是独立类型(不能把 `Long` 传给 `UserId`)
- 没有值类的限制(可多参数、可有方法、可扩展)
- companion 必须在**同一文件**才能提供转换

### 选型决策

| 场景 | 用 |
|------|-----|
| 简单包装,加 toString/方法 | 值类(Scala 2) / opaque type(Scala 3) |
| 想加 trait 行为 | opaque type + extension |
| 跨多个文件需要类型不同 | opaque type |
| Scala 2 旧代码 | 值类 |

## 5. @specialized 深入

`@specialized` 让泛型类/方法对特定原始类型生成特化代码,避免装箱。

```scala
def identity[@specialized(Int, Long, Double) T](x: T): T = x
```

编译器会生成 4 个特化方法:`identity[Int]`、`identity[Long]`、`identity[Double]`、`identity[T]`(其他类型走这条)。

**装箱代价**:在 hot path 中,`List[Int]` 的 `head` 会拆箱 Int 又装箱回 `java.lang.Integer`。
`@specialized` 告诉编译器"请直接用原始类型"。

**经验法则**:
- 数据结构(`List`, `Set`)的元素如果是泛型且常用于 `Int`/`Long`,加 `@specialized`
- 函数式编程中常用的 `Function1[-A, +B]` 标准库就用了 `@specialized`
- 不要无脑加;每个特化都是一个额外的方法,JIT 也会变难

## 6. 顶级定义(Scala 3)

Scala 2 的 `package object` 解决的问题是"包级共享定义"。
Scala 3 的解法是:**trait / class / object / val / type 可以直接写在文件顶层**,不需要任何容器。

```scala
// 文件:com/learning/util/Constants.scala
package com.learning.util

val DefaultTimeout: Int = 5000
type StringMap = Map[String, String]
trait Configurable
class UserService
```

**消费方**:
```scala
import com.learning.util.*
import com.learning.util.{DefaultTimeout, StringMap}
```

## 7. Matchable(Scala 3)

Scala 3 引入了 `Matchable` trait,作为"可被 pattern match"的最弱保证。

```scala
def describe(x: Matchable): String = x match
  case s: String => s"str $s"
  case i: Int    => s"int $i"
```

Scala 3 中,所有具体类型默认混入 `Matchable`(因为 `String` `Int` `List` 都是 `Matchable`)。
而类型参数 `T` 默认是 `T <: Any` 没有 `Matchable` 约束,所以**泛型方法内部不能 pattern match 任意 `T`**:

```scala
// 编译错误:Scala 3 中不允许 match 非 Matchable 的 T
def f[T](x: T): String = x match
  case _: String => "str"   // 编译失败
```

Scala 3.3+ 的修复:用 `T <: Matchable` 或 `T: Matchable`:
```scala
def f[T <: Matchable](x: T): String = x match
  case _: String => "str"   // OK
```

**注意**:`scala.reflect.ClassTag` 类型也提供 match 能力。

## 8. Nothing、Null、Unit 的真实使用

### Nothing

```scala
def fail(msg: String): Nothing = throw new RuntimeException(msg)

val xs: List[Int] = if cond then List(1) else fail("no data")
//                                              ^^^^^^^^^^
//  List[Nothing] <: List[Int],所以 OK
```

### Null —— 应该避免

```scala
var name: String = null  // 不要!
def find(): String | Null = ...  // Scala 3 union types 也尽量不用
```

替代方案:
- `Option[String]` 表达"可能没有"
- `Either[String, String]` 表达"可能错误"
- `Try[String]` 表达"可能抛异常"

### Unit

```scala
def log(msg: String): Unit = println(msg)
val f: () => Unit = () => println("side effect")
```

Scala 3 强制 `def f() = ...` 必须显式写 `: Unit = ...`。

## 9. 实操:写一个自己的类型

任务:为银行账户设计一个零成本抽象。

```scala
object AccountModule:
  // opaque type —— 防止账户号与 Long 混用
  opaque type AccountId = Long
  object AccountId:
    def apply(raw: Long): AccountId = raw
    extension (id: AccountId)
      def raw: Long = id

  // 一个有行为的值类(Scala 3 风格)
  final case class Money(amount: BigDecimal, currency: String):
    def +(o: Money): Money =
      require(currency == o.currency, s"currency mismatch: $currency vs ${o.currency}")
      Money(amount + o.amount, currency)
    def unary_- : Money = Money(-amount, currency)
```

```scala
// 跨文件使用时
import AccountModule.*
val a: AccountId = AccountId(42L)
val b: AccountId = AccountId(43L)
// val sum: Long = a + b  // 编译错误:AccountId 与 Long 不同
val sum: AccountId = a.raw + b.raw  // 必须显式拆
```

这是**类型安全**的真实价值:**编译器替你挡住错误**。

## 10. 检查清单

完成本章后你应该能:

- [ ] 画出 Any / AnyVal / AnyRef / Nothing / Null 的层级图
- [ ] 说出值类与 opaque type 的 3 个差异
- [ ] 用 `opaque type` 写一个跨文件类型安全的钱包
- [ ] 解释 `@specialized` 解决什么问题
- [ ] 写出自定义字符串插值器
- [ ] 解释 Scala 3 中泛型方法 pattern match 需要 `T <: Matchable` 的原因

如果有任何 [ ] 没勾上,回去看 M01 主文档与运行测试。
