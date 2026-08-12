# M04 ADT 与枚举深度

> Phase 1 核心模块。ADT 是 Scala 函数式编程的"骨架"。

## 1. 什么是 ADT

ADT = Algebraic Data Type(代数数据类型)。Scala 中主要用 **sealed trait + case class** 或 **enum** 表达。

ADT 的两个核心操作:
1. **构造**:`User("ada", 36)` 替代 `new User("ada", 36)`
2. **解构**:`user match { case User(name, age) => ... }`

## 2. 密封 (sealed) 的意义

```scala
sealed trait Shape
case class Circle(r: Double)      extends Shape
case class Rectangle(w: Double, h: Double) extends Shape
```

`sealed` 限制:Shape 的所有子类**必须**在**同一文件**内定义。

**收益**:
- 编译器知道 Shape 的**所有**可能子类型
- match 时编译器可以检查**穷尽性**
- 任何新子类型加入,编译器提醒"你的 match 没处理它"

Scala 2:sealed 警告不穷尽的 match
Scala 3:sealed 错误不穷尽的 match(默认)

## 3. 递归 ADT

```scala
sealed trait Json
case object JsonNull               extends Json
case class  JsonBool(b: Boolean)   extends Json
case class  JsonNum(n: BigDecimal) extends Json
case class  JsonStr(s: String)     extends Json
case case   JsonArr(items: List[Json])       extends Json
case case   JsonObj(fields: Map[String, Json]) extends Json
```

Json 的定义**自身引用了 Json**。这是 ADT 最强大的地方:用极简的语法表达递归树。

## 4. Scala 3 enum 完全指南

```scala
enum Color:
  case Red, Green, Blue

// 等价的 Scala 2 风格
sealed trait Color
case object Red   extends Color
case object Green extends Color
case object Blue  extends Color
```

### 带字段的 enum

```scala
enum Planet(mass: Double, radius: Double):
  case Mercury extends Planet(3.30e23, 2.44e6)
  case Venus   extends Planet(4.87e24, 6.05e6)
  case Earth   extends Planet(5.97e24, 6.37e6)
  case Mars    extends Planet(6.42e23, 3.39e6)
  case Jupiter extends Planet(1.90e27, 6.99e7)

  def surfaceGravity: Double = 6.67e-11 * mass / (radius * radius)
```

### 泛型 enum

```scala
enum Maybe[+A]:
  case Just(value: A)
  case Nothing
```

**注意**:
- enum 本身有类型参数 `+A`
- `Just` / `Nothing` 是 enum 的"case"对象,自动获得 `A` 类型参数
- 不能给 case 单独加类型参数

### enum 的方法

```scala
enum Status:
  case Active
  case Inactive(reason: String)
  case Banned(until: Long, by: String)

  def isActive: Boolean = this == Active
```

`isActive` 在 enum 内定义,所有 case 自动继承。

## 5. 模式匹配穷尽性

```scala
sealed trait Color
case object Red   extends Color
case object Green extends Color
case object Blue  extends Color

def describe(c: Color): String = c match
  case Red   => "red"
  case Green => "green"
  // 编译失败:missing case Blue
  case Blue  => "blue"
```

**实战**:
- 永远用 `sealed` 或 `enum` 表达有限种可能
- 让编译器帮你记住所有 case
- 写完一个 match,跑 `sbt compile` 看是否缺漏

## 6. 模式作为控制流

```scala
def handle(req: Request): Response = req match
  case GET(url)    => fetch(url)
  case POST(url, body) => save(url, body)
  case DELETE(url) => remove(url)
  case _           => NotFound
```

不要用 `instanceof` + cast,统一用 match。

## 7. 实战:一个表达式求值器

```scala
sealed trait Expr
case class Lit(n: Int)                extends Expr
case class Add(left: Expr, right: Expr) extends Expr
case class Mul(left: Expr, right: Expr) extends Expr
case class Var(name: String)          extends Expr

def eval(expr: Expr, env: Map[String, Int]): Int = expr match
  case Lit(n)                 => n
  case Add(l, r)              => eval(l, env) + eval(r, env)
  case Mul(l, r)              => eval(l, env) * eval(r, env)
  case Var(name)              => env(name)
```

Scala 表达式本身就是一个 ADT!这是为什么 Scala 编译器能用模式匹配做许多优化。

## 8. 案例类 (case class) 的所有特性

```scala
case class User(name: String, age: Int)
```

自动获得:
1. `apply(name, age)` 构造方法
2. `equals` / `hashCode`(基于字段)
3. `toString`(`User(ada, 36)`)
4. `copy(name = "bob")` 修改部分字段
5. **可被模式匹配解构**
6. 字段默认为 `val`(`var` 也可,但避免)

```scala
val u1 = User("ada", 36)
val u2 = u1.copy(age = 37)  // User("ada", 37)
val User(n, a) = u1          // n = "ada", a = 36
```

## 9. case object 与 case class 选型

| 场景 | 用 |
|------|-----|
| 唯一标识 | case object |
| 有数据 | case class |
| 多 case 的 ADT | sealed trait + case class/object |
| Scala 3 枚举 | enum |

## 10. Opaque Type + Enum 模式

```scala
object UserIdModule:
  opaque type UserId = Long
  object UserId:
    def apply(raw: Long): UserId = raw
    extension (id: UserId) def raw: Long = id

enum UserStatus:
  case Active
  case Inactive(reason: String)
  case Banned(until: Long)

case class User(id: UserIdModule.UserId, name: String, status: UserStatus)
```

每个 ID 都是类型安全的;每个 status 都有结构化字段。

## 11. 业务建模:支付系统

```scala
enum Currency(val code: String, val symbol: String):
  case USD extends Currency("USD", "$")
  case EUR extends Currency("EUR", "€")
  case CNY extends Currency("CNY", "¥")
  case JPY extends Currency("JPY", "¥")

final case class Money(amount: BigDecimal, currency: Currency):
  def +(o: Money): Money =
    require(currency == o.currency, s"currency mismatch")
    Money(amount + o.amount, currency)

sealed trait PaymentMethod
case class CreditCard(num: String, exp: String) extends PaymentMethod
case class BankAccount(iban: String)            extends PaymentMethod
case object CryptoWallet                        extends PaymentMethod

sealed trait PaymentStatus
case object Pending  extends PaymentStatus
case object Succeeded extends PaymentStatus
case class Failed(reason: String) extends PaymentStatus

case class Payment(
  id: Long,
  amount: Money,
  method: PaymentMethod,
  status: PaymentStatus
)
```

## 12. enum vs sealed trait + case class

| 场景 | 推荐 |
|------|------|
| 简单无参枚举 | enum |
| 带字段的有限集 | enum(Scala 3) |
| Scala 2 项目 | sealed trait + case class |
| 与 Java 互操作 | sealed trait + case class(Java 11+ 仍不识别 enum) |
| 复杂 ADT,有方法在内部 | enum |
| 内部混入多个 trait | sealed trait + case class(更灵活) |

**实战**:**Scala 3 默认用 enum**,Scala 2 用 sealed trait + case class。

## 13. 检查清单

- [ ] 解释 `sealed` 的作用
- [ ] 写一个 enum 带 3 个 case
- [ ] 写一个递归 ADT(Json、Expr、Tree)
- [ ] 解释 case class 自动获得的能力
- [ ] 写出 pattern match 的穷尽性 vs 警告 vs 错误
- [ ] 用 ADT 表达 3 个业务领域
- [ ] 解释 `opaque type` + enum 的组合优势
