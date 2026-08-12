# M20 类型级编程

> Phase 3 高级模块。用类型表达"在编译期已经知道的事实"。
> 这是 Scala 在 JVM 生态中独一无二的竞争力。

## 1. 什么是类型级编程

把通常在运行期做的事(条件、运算、查找)挪到**编译期**,用类型作为"变量"。

**收益**:
- 编译期发现错误
- 零运行时开销(常量被擦除)
- 类型即是文档

**代价**:
- 编译时间变长
- 学习曲线极陡
- 写出来别人看不懂

**原则**:**只在真的需要时用**。能用 case class + if 就别用类型级。

## 2. Peano 数

最经典的教学例子:在类型层面表示自然数。

```scala
// 0 与 successor
sealed trait Nat
case object Zero              extends Nat
case class  Succ[N <: Nat](n: N) extends Nat
```

类型别名简化书写:
```scala
type _0 = Zero
type _1 = Succ[_0]
type _2 = Succ[_1]
type _3 = Succ[_2]
```

**加法**:
```scala
type +[A <: Nat, B <: Nat] <: Nat = (A, B) match
  case (Zero, b)     => b
  case (Succ[a], b)  => Succ[a + b]
```

使用:
```scala
type R = _2 + _3  // 编译期计算为 _5
val five: Succ[Succ[Succ[Succ[Succ[Zero]]]]] = ???
```

**Scala 3.3 注意点**:上面用了 match types,需要 `-Ykind-projector` 或更现代的语法。

## 3. Scala 3 match types

Scala 3 引入的**类型级 match**。把运行期模式匹配的能力搬到类型上。

```scala
type Elem[X] = X match
  case List[a] => a
  case Array[a] => a
  case _       => X

type T1 = Elem[List[Int]]     // Int
type T2 = Elem[Array[String]] // String
type T3 = Elem[Int]           // Int(没匹配,回退)
```

**注意**:
- 必须穷尽,有 `case _` 兜底
- 编译器会**展开**(inline-like),所以递归要小心
- 复杂 match types 会让编译时间爆炸

## 4. Tuple 类型级操作

Scala 3 的 Tuple 是 HList 的简化版。

```scala
// 长度
type Length[T <: Tuple] <: Int = T match
  case EmptyTuple => 0
  case _ *: t     => 1 + Length[t]

type L1 = Length[(Int, String, Boolean)]  // 3

// 取最后一个
type Last[T <: Tuple] = T match
  case _ *: EmptyTuple => ???  // 不合法
  case _ *: rest      => Last[rest]
  case EmptyTuple     => Nothing
```

Scala 3 标准库提供:
```scala
import scala.compiletime.ops.int.*
type X = 1 + 2          // 3
type Y = "a" * 2        // "aa"
```

**实战**:用 `Tuple.Size` 在编译期校验"我需要 3 个参数"。

## 5. 依赖方法类型

方法的**返回类型**依赖**实例**或**参数值**。

```scala
trait Database:
  type Row
  def query(sql: String): List[Row]

val db1: Database = new Database { type Row = User; def query(s: String) = ... }
val db2: Database = new Database { type Row = Order; def query(s: String) = ... }

// db1.query 的返回类型是 List[User]
// db2.query 的返回类型是 List[Order]
```

**实战**:在 ORM、序列化库中区分"同一接口、不同结果"。

## 6. 路径依赖类型

```scala
class Database:
  class Row
  val db1 = Database()
  val db2 = Database()
  val r1: db1.Row = db1.Row()  // OK
  // val wrong: db2.Row = r1   // 编译失败
```

**实战**:区分"不同连接池的 Row"、"不同账户的余额"(见 M03 例子)。

## 7. HList(异构列表)

每个位置类型不同的列表。

```scala
sealed trait HList
case object HNil                              extends HList
case class  HCons[+H, +T <: HList](head: H, tail: T) extends HList

type ::[+H, +T <: HList] = HCons[H, T]
```

**用法**(Shapeless / Scala 3 风格):
```scala
val xs: Int :: String :: Boolean :: HNil = ::(1, ::("hi", ::(true, HNil)))
xs.head            // Int = 1
xs.tail.head       // String = "hi"
xs.tail.tail.head  // Boolean = true
```

**实战价值**:
- 类型级 CSV 解析:`("name", "age", "city") :: ...` 表达一行 schema
- 编译期校验的 record 类型
- 库作者(circe、doobie)的基础

## 8. 类型级证明 (Evidence)

```scala
// <:> 证明 A 是 B 的子类型
type <:!<[A, B] = A =:= B  // 简化的"不相等"
```

实战:用 **implicit evidence** 表达"我证明了 T 是 List":
```scala
def toList[T](xs: Seq[T]): List[T] = xs.toList
// 无需证明

// 但要"如果不是 List 就别传"
def onlyLists[T, L[X] <: List[X]](xs: L[T]): Int = xs.length
// 编译期拒绝 Set[T] 等
```

## 9. 实战:一个类型安全的事件总线

```scala
trait Event
case class UserCreated(id: Long) extends Event
case class OrderPlaced(id: Long, total: BigDecimal) extends Event

// 用 Tuple 做"事件列表"
type EventBus = UserCreated *: OrderPlaced *: EmptyTuple

// 消费者:接受对应事件类型
def handleUser(e: UserCreated): IO[Unit] = IO.println(s"user: ${e.id}")
def handleOrder(e: OrderPlaced): IO[Unit] = IO.println(s"order: ${e.id}")

// 用 match types 分发
type Dispatch[E] = E match
  case UserCreated => IO[Unit]
  case OrderPlaced => IO[Unit]
```

## 10. 实战:编译期校验的 Builder

```scala
import scala.compiletime.ops.int.*

// Builder 累加键值对,完成时输出 Map
class Builder[K <: Tuple, V <: Tuple]:
  def put[NewK, NewV](k: NewK, v: NewV)(using
    ev: Length[K] =:= Length[V]
  ): Builder[K :+ NewK, V :+ NewV] = ???

  def build: Map[?, ?] = ???
```

使用:
```scala
val b = Builder()
  .put("name", "ada")       // K = [String], V = [String]
  .put("age", 36)            // K = [String, String], V = [String, Int]
  // 编译失败:键值数量不等
```

## 11. 实用规则

1. **能用 case class 就用**——别炫技
2. **类型类 + Scala 3 macros 比手写类型级更靠谱**——可维护
3. **学习类型级是为了读懂库源码,不是为了写**
4. **当你觉得需要 HList 时,先问:case class 不行吗?**

## 12. 检查清单

- [ ] 用 Peano 数实现 `+` 的类型级版本
- [ ] 写一个 match type,根据输入类型返回不同类型
- [ ] 解释路径依赖类型
- [ ] 写一个 HList 的 `head` / `tail` / `append`
- [ ] 解释为什么"能读懂库源码"是类型级学习的目标
- [ ] 解释 match types 的限制
