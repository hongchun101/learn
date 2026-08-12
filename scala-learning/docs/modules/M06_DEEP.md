# M06 泛型深度

> Phase 2 核心模块。Scala 的类型系统是它最强的特性之一。

## 1. 型变 (Variance)

`class List[+A]` 中的 `+` 表示**协变**。

| 标记 | 名称 | 含义 |
|------|------|------|
| `+A` | 协变 | `A1 <: A2` ⇒ `F[A1] <: F[A2]` |
| `-A` | 逆变 | `A1 <: A2` ⇒ `F[A2] <: F[A1]`(反的!) |
| `A` | 不变 | 没有子类型关系 |

**经验法则**:
- **容器**用 `+A`(生产者):`List[Cat] <: List[Animal]`
- **消费者**用 `-A`:`Consumer[Animal] <: Consumer[Cat]`
- 既产又消,用 `A`(不变)

```scala
// 协变:List 只能产出 A
sealed trait List[+A]
case object Nil extends List[Nothing]
case class Cons[A](head: A, tail: List[A]) extends List[A]

// 逆变:Printer 只消费 A
trait Printer[-A]:
  def print(a: A): String

val animalPrinter: Printer[Animal] = (a: Animal) => a.name
val catPrinter: Printer[Cat] = animalPrinter  // 因为 Printer[Animal] <: Printer[Cat]

// 不变:Buffer 既能读也能写
class Buffer[A]:
  def add(a: A): Unit = ???
  def head: A = ???
```

## 2. 协变与不可变性的耦合

协变的容器必须**只读不写**。否则类型不安全。

```scala
// 错误:协变类不能有"消费 A"的方法
class MutableList[+A]:
  def add(a: A): Unit = ???  // 编译失败
```

为什么?
```scala
// 如果允许 add,就能写出:
val dogs: MutableList[Dog] = MutableList[Dog]()
val animals: MutableList[Animal] = dogs       // MutableList[Dog] <: MutableList[Animal]
animals.add(Cat("felix"))                     // 危险!但编译器拦不住
```

## 3. 协变的边界 (Lower Bound)

有时候你想让一个方法"用"某个类型,但不破坏协变。

```scala
sealed trait List[+A]:
  def prepend[B >: A](b: B): List[B] = Cons(b, this)
  //                       ^^^^^^^
  // B 是 A 的父类(下界);返回 List[B] 是安全的
```

`Nil <: List[Int]`(因为 `Nothing <: Int`),所以可以 `Nil.prepend(42)` 得到 `List[Int]`。

## 4. 抽象类型 vs 类型参数

```scala
// 抽象类型:每个实现可绑不同类型
trait Container:
  type T
  def add(t: T): Unit
  def get(idx: Int): T

// 类型参数:同一抽象,装不同类型
trait Container[T]:
  def add(t: T): Unit
  def get(idx: Int): T
```

**何时用抽象类型?**
- 想表达"实现时才知道,且每个实现不同"
- 想把类型**作为**实现细节隐藏
- 例:路径依赖类型

**何时用类型参数?**
- 同一逻辑处理多种类型
- 库作者对外暴露的 API

**实战**:99% 的情况用类型参数。抽象类型是高级武器。

## 5. F-Bounded 多态

让类型参数引用"自身":

```scala
trait Comparable[T <: Comparable[T]]:
  def compareTo(other: T): Int

class Money(val amount: BigDecimal) extends Comparable[Money]:
  def compareTo(other: Money): Int = amount.compare(other.amount)
```

**问题**:`Comparable[T]` 中的 T 是**自身类型**。这让"能与自己比较"成为类型约束。

**实战**:Java 早期 API 用得很广。Scala 中更推荐类型类:
```scala
trait Ord[A]:
  def compare(a: A, b: A): Int
```

## 6. 高阶类型 (HKT)

`F[_]` 表达"一个类型构造器"。

```scala
trait Functor[F[_]]:
  def map[A, B](fa: F[A])(f: A => B): F[B]
```

**为什么需要 HKT?**
- 想写"能 map 任何容器"
- 想表达"任何 monad"
- 想做"高阶抽象"(traverse、sequence、mapN)

**实例**:`List`、`Option`、`Future`、`Either[L, +*]` 都有 `Functor` 实例。

## 7. 类型 Lambda(Scala 2 vs 3)

Scala 2 需要 kind-projector 插件,或手写:
```scala
type EitherTF[F[_], G[_], A] = ({ type L[a] = F[G[a]] })#L
```

Scala 3 原生:
```scala
type Compose[F[_], G[_]] = [A] =>> F[G[A]]
```

**实战**:
```scala
// Compose[List, Option] 就是 List[Option[_]]
type ComposedListOption[T] = Compose[List, Option][T]
val xs: ComposedListOption[Int] = List(Some(1), None, Some(2))
```

## 8. 类型约束 (Type Constraints)

```scala
// =:= : 类型相等
def sameType[A, B](using ev: A =:= B): Unit = ???

// <:< : 子类型
def subtypeOf[A, B](using ev: A <:< B): Unit = ???
```

**实战**:
```scala
// 一个"接受任何 tuple,但要求 tuple 元素可显示"的方法
def showTuple[T <: Tuple](t: T)(using same: T =:= EmptyTuple): String = ""
//              ^^^^^^^^^^^ 约束 T <: Tuple
//                            ^^^^^^^^^^^^^^^^^^^^^^^^^ 进一步约束 T 是空
```

## 9. Match Types(Scala 3.3+)

Scala 3 的 match types 把"模式匹配"搬到类型层。

```scala
type Elem[X] = X match
  case List[a] => a
  case Array[a] => a
  case _ => X

type T1 = Elem[List[Int]]     // Int
type T2 = Elem[Array[String]] // String
type T3 = Elem[Int]           // Int(回退)
```

**限制**:
- 必须有兜底 `case _`
- 不能引用运行时数据
- 复杂 match types 会让编译变慢

## 10. 路径依赖类型

```scala
class Database:
  class Row
  def create: Row = new Row

val db1 = new Database
val db2 = new Database
val r1: db1.Row = db1.create
// val r2: db2.Row = r1  // 编译失败!
```

**实战**:Slick / Quill 等 ORM 大量使用路径依赖类型做"会话内的表"。

## 11. Dependent Types(依赖类型)

```scala
trait SizedList:
  type N <: Int
  def size: N
  def head: ???
```

Scala 3 有"依赖方法类型":返回类型依赖**实例**。

```scala
trait HasLength:
  type Length <: Int
  def length: Length
```

**实战**:不常用,因为不够灵活。路径依赖 + 类型参数组合通常够用。

## 12. 实战:一个类型安全的 Map

```scala
trait Key:
  type Value

class IntKey extends Key:
  type Value = Int

class StringKey extends Key:
  type Value = String

// 路径依赖 + 类型安全
class TypedStore[Self]:
  self: Self =>
  private val data = scala.collection.mutable.Map.empty[String, Any]

  def put[K <: Key, V](key: K, value: V)(using ev: V =:= K#Value): Unit =
    data(key.toString) = value
```

## 13. 检查清单

- [ ] 解释 `+A` 与 `-A` 的方向
- [ ] 解释协变类不能消费 A 的原因
- [ ] 解释抽象类型与类型参数的选择
- [ ] 写一个 `Functor[F[_]]` 的实例
- [ ] 用类型 lambda 组合两个 HKT
- [ ] 解释 `F-Bounded` 多态
- [ ] 写一个路径依赖类型的例子
