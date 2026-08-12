# M03 类、特质与对象深度

> Phase 1 模块。本章是 Scala 面向对象的全部知识。

## 1. 主构造器与字段

主构造器是**类签名后的整个类体**。

```scala
class Person(val name: String, var age: Int, address: String):
  // 1) address 不是 val/var,所以是"构造参数",只构造时可见
  // 2) val name 是公有不可变字段
  // 3) var age 是公有可变字段
  println(s"init $name from $address")  // 构造逻辑
```

**注意**:任何在类体中执行的代码都是主构造器的一部分。

```scala
class Person(val name: String, var age: Int):
  if age < 0 then throw new IllegalArgumentException("age < 0")
  // 即使没人调用,这段也会在 new Person(...) 时执行
```

## 2. 辅助构造器

```scala
class Person(val name: String, var age: Int):
  def this(name: String) = this(name, 0)            // 调用主构造器
  def this() = this("anonymous")                      // 链式调用
```

**约束**:
- 辅助构造器第一行必须**直接调用**主构造器或另一个辅助构造器(`this(...)`)
- Scala 3 还有一种"二级构造参数"语法:在主构造器之外再用 `class Person(name: String):` 是非法

**实践**:能用默认参数就不要写辅助构造器。

## 3. 特质 (Trait)

特质 = 抽象类 + 可以多继承 + 可以带具体方法 + 可以有字段。

```scala
trait Logged:
  def log(msg: String): Unit = println(s"[log] $msg")  // 具体方法

trait Timestamp extends Logged:                       // 特质可以继承特质
  abstract override def log(msg: String): Unit =
    super.log(s"${System.currentTimeMillis()} $msg")  // abstract override 是栈式修饰

class Service extends Timestamp, Logged:
  def run(): Unit = log("started")
```

**栈式修饰规则**:
- `super.log(...)` 在 trait 中调用父特质同名方法
- 子类混入多个 trait 时,编译器把多个 `log` 链接起来
- 这就是**特质线性化**(trait linearization)

## 4. 特质线性化

Scala 解析 `super` 时,使用一种**确定性算法**把多重继承扁平化为一个线性顺序。

```scala
trait A { def x = "A" }
trait B extends A { override def x = "B" + super.x }
trait C extends A { override def x = "C" + super.x }

class D extends B with C
// new D().x == ?
// 线性化: D -> C -> B -> A
// C.x = "C" + super.x
//           = "C" + B.x
//           = "C" + "B" + super.x
//           = "C" + "B" + "A"
//         = "CBA"
```

**实战影响**:
- 你写 `class D extends B with C` 时,要清楚 `super` 调用的顺序
- 调试时,如果调用栈里出现"先 C 后 B",对照线性化规则
- 在 Scala 3 中,`extends B, C` 顺序仍然是从右到左解析

## 5. 自身类型 (Self-Type)

`self: T =>` 约束:混入这个 trait 的类必须**也混入** `T`。

```scala
trait Persistable:
  self: Container =>           // 必须混入 Container
  def save(): String = s"${get(0)} saved"  // get() 来自 Container

trait Container:
  type T
  def get(idx: Int): T

class StringContainer extends Container:
  type T = String
  private var data = Vector.empty[String]
  def add(elem: String): Unit = data = data :+ elem
  def get(idx: Int): String = data(idx)

// 编译失败:StringContainer 没有混入 Persistable
// val x = new StringContainer with Persistable
// OK
val y = new StringContainer with Persistable
y.save()
```

**`self` 还可以给当前实例起别名**:
```scala
trait Builder:
  self =>
  def setName(n: String): this.type =
    self.name = n    // 在嵌套类中,this 可能指向内部类;self 永远指向外部
    this
```

## 6. 抽象类型成员

```scala
trait Container:
  type T                // 抽象类型,由子类实现
  def add(elem: T): Unit
  def get(idx: Int): T

class StringContainer extends Container:
  type T = String
  private var data = Vector.empty[String]
  def add(elem: String): Unit = data = data :+ elem
  def get(idx: Int): String = data(idx)
```

**何时用抽象类型 vs 类型参数?**
- 类型参数:`class List[A]` —— 同一种数据结构,装不同类型
- 抽象类型:`trait Container { type T }` —— 同一类抽象,**每个实现可以**用不同具体类型

```scala
def firstOf(c: Container): c.T = c.get(0)
//                              ^^^^^
// 这里使用 c.T,因为 c 的具体类型在调用时才确定
```

**依赖方法类型**:返回类型依赖**实例**,而非类型参数。

## 7. `open` 修饰符(Scala 3)

Scala 3 默认类 `final`(不可继承)。要允许继承,显式 `open`:

```scala
open class Service extends Logged:
  def run(): Unit = log("started")

class SpecialService extends Service  // OK
```

**为什么默认 final?**
- 防止无意中继承
- 编译器可以做更多优化(单态化、虚调用消除)
- 实际项目中,80% 的类不该被继承

**反例**:trait 默认还是开放的(因为 trait 本来就是"可继承")。

## 8. 包对象 → 顶级定义(Scala 3)

Scala 2:
```scala
// com/learning/util/package.scala
package com.learning
package object util {
  type StringMap = Map[String, String]
  val Default: String = "default"
  implicit val ec: ExecutionContext = ...
}
```

Scala 3:
```scala
// com/learning/util/Constants.scala
package com.learning.util

type StringMap = Map[String, String]
val Default: String = "default"
given ec: ExecutionContext = ...
```

或者用 `export` 重新导出子包:
```scala
package com.learning.api:
  export com.learning.util.{Default, StringMap}
```

## 9. 实战:领域模型

```scala
sealed trait OrderStatus
case object Pending   extends OrderStatus
case object Confirmed extends OrderStatus
case object Cancelled extends OrderStatus

trait Auditable:
  def createdBy: String
  def createdAt: Long

trait Versioned:
  def version: Int
  def increment: this.type  // 返回当前类型

case class Order(
  id: OrderId,
  items: List[LineItem],
  status: OrderStatus = Pending
) extends Auditable, Versioned:
  def createdBy: String = "system"
  def createdAt: Long = 0L
  def version: Int = 1
  def increment: this.type = copy(version = version + 1)
  def total: Money = items.map(_.subtotal).fold(Money.zero)(_ + _)

case class LineItem(productId: ProductId, qty: Int, price: Money):
  def subtotal: Money = price * qty
```

**注意**:
- `case class` 的 `copy` 自动可用
- `this.type` 让 `increment` 返回**当前**类型(子类型也能用)
- `Money` 是一个值类(opaque type),所以 `Money.zero` 是零成本的"零钱"

## 10. Companion 模式

Scala 中,**类与同名 object 互为 companion**。它们共享私有访问权限。

```scala
class Account(val id: Long, val balance: Money):
  import Account.*     // 引入 companion 成员
  def deposit(amount: Money): Account = copy(balance = balance + amount)

object Account:
  def apply(id: Long): Account = new Account(id, Money.zero)
  def fromRaw(raw: Long): Option[Account] = ???
```

**实战收益**:
- `apply` 让 `Account(42)` 替代 `new Account(42)`
- companion 是类型类实例的"自然"家——自动进入隐式作用域
- 可以把工厂方法、不变值放在 companion

## 11. 抽象类 vs Trait

| 场景 | 用 |
|------|-----|
| 需要 Java 互操作(`@BeanProperty` 等 Java 注解) | class |
| 需要主构造器参数带值 | class(更简洁) |
| 需要静态字段 | companion object |
| 想用 `with` 混入 | trait |
| 想用作类型类 | trait |
| 想用作 ADT 父类型 | sealed trait |
| 想用栈式修饰 | trait |

**经验法则**:默认用 trait,除非有具体理由用 class。

## 12. 检查清单

- [ ] 解释主构造器与类的关系
- [ ] 写出自身类型并解释其用途
- [ ] 解释特质线性化
- [ ] 用 `opaque type` 写一个安全的 ID 类型
- [ ] 解释 `this.type` 的作用
- [ ] 区分抽象类型与类型参数的使用场景
- [ ] 把 Scala 2 的 `package object` 改写为 Scala 3 顶级定义
