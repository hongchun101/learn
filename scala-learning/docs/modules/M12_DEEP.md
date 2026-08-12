# M12 错误处理深度

> Phase 1 核心模块。Scala 的"无异常"哲学是它最大的优点之一。

## 1. 三种"缺失"的语义

| 类型 | 缺失什么 | 何时用 |
|------|----------|--------|
| `Option[A]` | 值 | 找不到用户、解析失败但不关心原因 |
| `Either[L, R]` | 值 + 错误原因 | 需要返回错误细节 |
| `Try[A]` | 异常 | 包装可能抛异常的副作用 |

**核心规则**:
- 函数式代码用 `Either` 显式表达错误
- 副作用边界(IO)用 `Try` 包装
- "可能没有"用 `Option`

## 2. Option 详解

```scala
val o: Option[Int] = Some(42)
val n: Option[Int] = None

o.map(_ + 1)               // Some(43)
n.map(_ + 1)               // None
o.flatMap(x => Some(x * 2))  // Some(84)
n.flatMap(x => Some(x * 2))  // None
o.filter(_ > 0)            // Some(42)
o.fold("empty")(x => s"got $x")  // "got 42"

o.getOrElse(0)   // 42
o.orElse(Some(0)) // Some(42)
```

**实战陷阱**:
```scala
// 反例:嵌套 Option
def find(): Option[Option[User]] = ???
val o = find().flatten  // Option[User] - 但 flatMap 更地道

// 正例
def find(): Option[User] = ???
val u = find()
```

## 3. Either 详解

```scala
val e: Either[String, Int] = Right(42)
val f: Either[String, Int] = Left("oops")

e.map(_ + 1)             // Right(43)
f.map(_ + 1)             // Left("oops") - 不变
e.left.map(s => s"!!$s")  // Right(42) - 翻转焦点

// fold:同时处理两个
e.fold(err => s"err: $err", v => s"got $v")
// "got 42"
```

**`Either` 的"偏左"语义**:
- `Left` 是"错误"(类型参数 L)
- `Right` 是"成功"(类型参数 R)
- `flatMap` 时 Left 短路,Right 继续

## 4. 实战:Either 流水线

```scala
sealed trait AppError
case class NotFound(what: String)   extends AppError
case class Invalid(reason: String)  extends AppError
case object Unauthorized            extends AppError

def loadUser(id: Long): Either[AppError, User] = ???
def loadPrefs(userId: Long): Either[AppError, Prefs] = ???
def render(user: User, prefs: Prefs): Either[AppError, Html] = ???

def renderUserPage(id: Long): Either[AppError, Html] = for
  u <- loadUser(id)         // AppError 短路
  p <- loadPrefs(u.id)      // 任何 AppError 都立即返回
  h <- render(u, p)
yield h
```

## 5. Try 详解

```scala
import scala.util.{Try, Success, Failure}

val t: Try[Int] = Try(42 / 0)
t match
  case Success(v) => println(v)
  case Failure(e) => println(s"err: $e")

t.recover { case _: ArithmeticException => 0 }   // Success(0)
t.recoverWith { case _: ArithmeticException => Success(0) }

val fromEither: Try[Int] = Right(42).toTry  // 假定 Right
val fromOption: Try[Int] = Some(42).toTry   // 假定 Some
```

**Try vs Either**:
- `Try` 假设错误总是 `Throwable`
- `Either` 让错误有具体类型

**生产建议**:
- 在**副作用边界**用 `Try`(与 Java API 互转)
- 在**业务代码**用 `Either`(类型安全的错误)

## 6. Validated(cats)

`Validated` 是 cats 提供的"累加错误"的类型。

```scala
import cats.data.Validated
import cats.syntax.all.*

sealed trait FormError
case class NameTooShort(min: Int)  extends FormError
case class EmailInvalid             extends FormError
case object AgeOutOfRange           extends FormError

def validateName(s: String): Validated[FormError, String] =
  if s.length >= 3 then Validated.valid(s) else Validated.invalid(NameTooShort(3))

def validateEmail(s: String): Validated[FormError, String] =
  if s.contains("@") then Validated.valid(s) else Validated.invalid(EmailInvalid)

def validateAge(n: Int): Validated[FormError, Int] =
  if n >= 18 && n <= 120 then Validated.valid(n) else Validated.invalid(AgeOutOfRange)

case class FormData(name: String, email: String, age: Int)

// 累加所有错误
def validate(name: String, email: String, age: Int): Validated[FormError, FormData] =
  (validateName(name), validateEmail(email), validateAge(age)).mapN(FormData)

// 使用
validate("a", "bad", 200) match
  case Valid(d)   => println(s"OK: $d")
  case Invalid(e) => println(s"errors: $e")  // 一次性看到所有错误
```

**生产价值**:
- **API 表单**:用户希望一次性看到所有错误
- **配置文件解析**:看到所有错误才好修
- **业务规则**:多条独立规则

**不要用 Validated 做"业务流水线"**——它的 `flatMap` 是"短路"的(只显示第一个错误),要用 `Either`。

## 7. Ior(cats)

`Ior[A, B] = Left(a) | Right(b) | Both(a, b)` —— 同时保留"部分成功"。

```scala
import cats.data.Ior
import cats.syntax.all.*

val r: Ior[String, Int] = Ior.Both("warning", 42)
r match
  case Ior.Left(e)       => println(s"err: $e")
  case Ior.Right(v)      => println(s"got: $v")
  case Ior.Both(e, v)    => println(s"warn $e but got: $v")
```

**实战**:"警告 + 结果"场景,如 CSV 解析时跳过的非法行。

## 8. Either vs Validated vs Ior

| 类型 | 错误处理 | 何时用 |
|------|----------|--------|
| `Either[L, R]` | 短路 | 业务流水线、有依赖 |
| `Validated[E, A]` | 累加 | 表单验证、配置 |
| `Ior[E, A]` | 部分成功 | 解析器、带警告的报告 |

## 9. 错误处理在 cats-effect 中

```scala
import cats.effect.*

def loadUser(id: Long): IO[User] = IO {
  if id < 0 then throw new IllegalArgumentException(s"bad id: $id")
  else User(id, s"user-$id")
}

// IO 内部可以用 try/catch,但更好的方式
def loadUserSafe(id: Long): IO[User] =
  IO.pure(User(id, s"user-$id"))
    .adaptError { case _: IllegalArgumentException => new RuntimeException("user error") }

// 或者用 Either
def loadUserEither(id: Long): Either[String, User] =
  if id < 0 then Left(s"bad id: $id")
  else Right(User(id, s"user-$id"))

def loadUserIO(id: Long): IO[User] = IO.fromEither(loadUserEither(id))
```

**Either 在 IO 内部是惯用的**。IO 处理异常,Either 处理业务错误。

## 10. 何时抛异常

**抛异常**:
- 程序错误:`require(x >= 0, "x must be non-negative")`
- JVM 错误:OutOfMemoryError,StackOverflowError
- 不可恢复的 I/O 协议错误

**不抛异常**:
- 业务错误(用户不存在、参数非法)
- 可恢复的网络错误
- 任何在正常流程中可能失败的步骤

**实战**:
```scala
// 业务错误 → Either
def loadUser(id: Long): Either[AppError, User] = ???

// 程序错误 → require
def requirePositive(x: Int): Int =
  require(x > 0, s"x must be positive, got $x")

// 不可恢复 → 抛
def loadConfig(path: String): Config =
  scala.util.Try(readFile(path)) match
    case Success(content) => parseConfig(content)
    case Failure(_)        => throw new RuntimeException(s"config not found: $path")
```

## 11. 实战:完整的错误处理

```scala
sealed trait ApiError(val httpStatus: Int, val message: String)
case class NotFound(what: String)    extends ApiError(404, s"not found: $what")
case class InvalidRequest(reason: String) extends ApiError(400, reason)
case object Unauthorized             extends ApiError(401, "auth required")
case object InternalError            extends ApiError(500, "internal error")

// Repository:返回 Either
trait UserRepo:
  def find(id: Long): IO[Either[ApiError, User]]

// Service:Either 串接
class UserService(repo: UserRepo):
  def getProfile(id: Long): IO[Either[ApiError, Profile]] =
    for
      eUser <- repo.find(id)
      profile <- eUser.flatMap { user =>
        if user.active then Right(Profile.fromUser(user))
        else Left(Unauthorized)
      }
    yield profile

// Controller:把 Either 转 HTTP
def handleGet(id: Long): IO[Response] =
  service.getProfile(id).map {
    case Right(p) => Ok(p.asJson)
    case Left(e)  => Response(e.httpStatus, e.message.asJson)
  }
```

## 12. 检查清单

- [ ] 解释 Option / Either / Try 的语义差异
- [ ] 写一个 for 在 Either 上串 3 步
- [ ] 解释 Validated 与 Either 的使用场景
- [ ] 解释 Ior 的"部分成功"语义
- [ ] 解释为什么"业务错误"不该用抛异常
- [ ] 解释 IO 中如何处理错误
- [ ] 写一个完整的 API 错误处理流水线
