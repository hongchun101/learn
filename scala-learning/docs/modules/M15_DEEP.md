# M15 高级类型深度

> Phase 2 核心模块。本章是 Scala 库作者的武器。

## 1. 路径依赖类型 (Path-Dependent Types)

```scala
class Database:
  class Row
  def create: Row = new Row

val db1 = new Database
val db2 = new Database
val r1: db1.Row = db1.create
// val r2: db2.Row = r1  // 编译失败
```

**核心**:不同 Database 实例的 `Row` 是**不同类型**。

**实战**:Slick ORM 用它表达"表是会话的一部分"。

## 2. 依赖方法类型 (Dependent Method Types)

```scala
trait HasLength:
  type Length <: Int
  def length: Length

class Len7 extends HasLength:
  type Length = 7
  def length = 7

class LenString extends HasLength:
  type Length = String
  def length = "seven"

val l: Len7 = new Len7
val n: l.Length = l.length  // Int = 7
```

方法的返回类型依赖**实例**。

## 3. 类型 Lambda

**Scala 2** (需要 kind-projector):
```scala
type Compose[F[_], G[_]] = [A] =>> F[G[A]]  // 3.3 之前的写法
// 或
type Compose2[F[_], G[_], A] = ({ type L[a] = F[G[a]] })#L
```

**Scala 3.3+ 原生**:
```scala
type Compose[F[_], G[_]] = [A] =>> F[G[A]]
```

**实战**:
```scala
type ComposedListOption[T] = Compose[List, Option][T]
val xs: ComposedListOption[Int] = List(Some(1), None, Some(2))
```

## 4. 高阶类型的应用

```scala
trait Functor[F[_]]:
  extension [A](fa: F[A])
    def map[B](f: A => B): F[B]

// 任意 F 都能 map
List(1, 2, 3).map(_ + 1)
Option(1).map(_ + 1)
```

**实战**:
- 实现 cats / scalaz 库
- 写"能 map 任何东西"的通用代码

## 5. Match Types (Scala 3.3+)

```scala
type Elem[X] = X match
  case List[a]   => a
  case Vector[a] => a
  case Option[a] => a
  case _         => X

type T1 = Elem[List[Int]]      // Int
type T2 = Elem[Vector[String]] // String
type T3 = Elem[Int]            // Int(兜底)
```

**实战**:
- 写"根据输入类型返回不同类型"的函数
- DSL 编译器

**限制**:
- 必须有 `case _` 兜底
- 复杂 case 让编译变慢
- 不能依赖运行时值

## 6. 抽象类型成员 vs 类型参数

```scala
// 抽象类型
trait Container:
  type T
  def add(elem: T): Unit

// 类型参数
trait Container[T]:
  def add(elem: T): Unit
```

**何时用**:
- 抽象类型:每个实现可以绑不同类型(实现细节)
- 类型参数:同一逻辑,装不同类型(对外 API)

## 7. F-Bounded 多态

```scala
trait Comparable[T <: Comparable[T]]:
  def compareTo(other: T): Int

class Money(val amount: BigDecimal) extends Comparable[Money]:
  def compareTo(other: Money): Int = amount.compare(other.amount)
```

Scala 2 时代广泛使用,Scala 3 时代被类型类(Ord)取代。

## 8. 类型约束

```scala
// =:= 类型相等
// <:< 子类型
import scala.reflect.TypeTest

def cast[A, B](a: A)(using tt: TypeTest[A, B]): Option[B] =
  if summon[TypeTest[A, B]].unapply(a).isDefined then Some(a.asInstanceOf[B]) else None
```

**实战**:
- 写"如果类型对得上"的函数
- 编译期断言

## 9. 实战:类型安全的 EventBus

```scala
trait EventBus[Self]:
  self: Self =>
  type Event
  def subscribe(f: Event => Unit): Unit
  def publish(e: Event): Unit

class UserBus extends EventBus[UserBus]:
  sealed trait Event
  case class UserCreated(id: Long) extends Event
  case class UserDeleted(id: Long) extends Event
  private val subs = scala.collection.mutable.ListBuffer[Event => Unit]()
  def subscribe(f: Event => Unit): Unit = subs += f
  def publish(e: Event): Unit = subs.foreach(_(e))
```

## 10. 实战:类型级 Builder

```scala
// Builder 累加键值对,完成时输出 Map
class Builder[K <: Tuple, V <: Tuple]:
  def put[NewK, NewV](k: NewK, v: NewV)(using
    ev: Tuple.Size[K] =:= Tuple.Size[V]
  ): Builder[K :+ NewK, V :+ NewV] = ???

  def build: Map[?, ?] = ???

val m: Map[String, Int] = Builder()
  .put("a", 1)
  .put("b", 2)
  .build
```

## 11. 实战:Phantom Types(幻类型)

```scala
sealed trait State
trait Locked   extends State
trait Unlocked extends State

class Door[+S <: State]:
  def unlock(using S =:= Locked): Door[Unlocked] = new Door[Unlocked]
  def lock(using S =:= Unlocked): Door[Locked]   = new Door[Locked]
  def open(using S =:= Unlocked): Unit = println("opened!")

val d = new Door[Locked]
// d.open  // 编译失败:未解锁!
val d2 = d.unlock
d2.open   // OK
d2.unlock  // 编译失败:已经解锁!
```

**实战**:
- 资源生命周期(锁/未锁、连接/未连接)
- API 状态机
- 让无效操作在编译期失败

## 12. 检查清单

- [ ] 解释路径依赖类型
- [ ] 用类型 lambda 组合两个 HKT
- [ ] 写一个 match type
- [ ] 解释 F-Bounded 多态的用途
- [ ] 解释 Phantom Type 的作用
- [ ] 用类型约束写一个"只能加不能减"的集合
