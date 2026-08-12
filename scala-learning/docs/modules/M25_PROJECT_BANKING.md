# M25 项目:银行账户系统

> Phase 3 实战。本项目把 Phase 1-3 的所有内容组合起来。
> 时长:10-15 小时。**必须亲手做**。

## 1. 项目目标

构建一个简单的银行账户系统,具备:
1. 存款、取款、转账
2. 审计日志
3. 并发安全
4. HTTP API
5. 持久化(可选)

**技术栈**:
- Scala 3.3
- cats-effect 3.5
- http4s 0.23
- circe 0.14
- tapir 1.x
- MUnit 测试

## 2. 领域模型

```scala
package com.example.bank.domain

import java.time.Instant

// 不变的钱
opaque type Money = BigDecimal
object Money:
  def apply(amount: BigDecimal): Money = amount
  extension (m: Money) def amount: BigDecimal = m
  given Numeric[Money] = BigDecimal.Numeric
  given Ordering[Money] = Ordering.by(identity)

// 账号(路径依赖类型)
class Bank:
  class Account:
    opaque type AccountId = String
    object AccountId:
      def apply(raw: String): AccountId = raw
      extension (id: AccountId) def raw: String = id

// 账户事件
enum AccountEvent:
  case Opened(id: String, at: Instant, initialDeposit: Money)
  case Deposited(id: String, at: Instant, amount: Money, balance: Money)
  case Withdrawn(id: String, at: Instant, amount: Money, balance: Money)
  case Transferred(from: String, to: String, at: Instant, amount: Money)
```

## 3. 业务逻辑

```scala
package com.example.bank.service

import cats.effect.*
import com.example.bank.domain.*
import com.example.bank.repo.AccountRepo

trait AccountService:
  def open(initial: Money): IO[AccountId]
  def deposit(id: AccountId, amount: Money): IO[Money]
  def withdraw(id: AccountId, amount: Money): IO[Money]
  def transfer(from: AccountId, to: AccountId, amount: Money): IO[Unit]
  def balance(id: AccountId): IO[Money]
  def history(id: AccountId): IO[List[AccountEvent]]

class AccountServiceImpl(repo: AccountRepo) extends AccountService:
  def open(initial: Money): IO[AccountId] =
    for
      id <- IO.randomUUID.map(_.toString)
      _  <- repo.save(AccountEvent.Opened(id, Instant.now(), initial))
    yield AccountId(id)

  def deposit(id: AccountId, amount: Money): IO[Money] =
    require(amount > Money(0), "amount must be positive")
    for
      current <- repo.balanceOf(id)
      newBal  = current + amount
      _       <- repo.save(AccountEvent.Deposited(id.raw, Instant.now(), amount, newBal))
    yield newBal

  def withdraw(id: AccountId, amount: Money): IO[Money] =
    for
      current <- repo.balanceOf(id)
      _       <- IO.raiseWhen(current < amount)(InsufficientFunds(id, current, amount))
      newBal  = current - amount
      _       <- repo.save(AccountEvent.Withdrawn(id.raw, Instant.now(), amount, newBal))
    yield newBal

  def transfer(from: AccountId, to: AccountId, amount: Money): IO[Unit] =
    for
      _ <- withdraw(from, amount)
      _ <- deposit(to, amount)
      _ <- repo.save(AccountEvent.Transferred(from.raw, to.raw, Instant.now(), amount))
    yield ()

  def balance(id: AccountId): IO[Money] = repo.balanceOf(id)
  def history(id: AccountId): IO[List[AccountEvent]] = repo.historyOf(id)

case class InsufficientFunds(id: AccountId, current: Money, requested: Money) extends RuntimeException(...)
```

## 4. 持久化(内存实现,生产可换 doobie)

```scala
package com.example.bank.repo

import cats.effect.*
import com.example.bank.domain.*
import scala.collection.immutable.Queue

trait AccountRepo:
  def save(event: AccountEvent): IO[Unit]
  def balanceOf(id: AccountId): IO[Money]
  def historyOf(id: AccountId): IO[List[AccountEvent]]

class InMemoryAccountRepo extends AccountRepo:
  // 状态:Map[AccountId, (Balance, History)]
  private val state = scala.collection.mutable.Map.empty[String, (Money, Queue[AccountEvent])]

  def save(event: AccountEvent): IO[Unit] = IO {
    state.synchronized {
      val id = event match
        case AccountEvent.Opened(id, _, initial)     => (id, initial, Queue(event))
        case AccountEvent.Deposited(id, _, _, bal)  => (id, bal, Queue(event))
        case AccountEvent.Withdrawn(id, _, _, bal)  => (id, bal, Queue(event))
        case AccountEvent.Transferred(from, to, _, _) => /* 更新两账户 */ ???
      // ... 实际实现
    }
  }
  // ...
```

## 5. HTTP API(tapir)

```scala
package com.example.bank.api

import sttp.tapir.*
import sttp.tapir.json.circe.*
import sttp.tapir.server.http4s.Http4sServerInterpreter
import cats.effect.*
import com.example.bank.domain.*
import com.example.bank.service.AccountService

object Endpoints:
  // POST /accounts
  val openAccount = endpoint
    .post
    .in("accounts")
    .in(jsonBody[OpenAccountRequest])
    .out(jsonBody[OpenAccountResponse])

  case class OpenAccountRequest(initial: BigDecimal)
  case class OpenAccountResponse(id: String)

  // GET /accounts/{id}
  val getAccount = endpoint
    .get
    .in("accounts" / path[String]("id"))
    .out(jsonBody[AccountResponse])

  case class AccountResponse(id: String, balance: BigDecimal)

  // POST /accounts/{id}/deposit
  val deposit = endpoint
    .post
    .in("accounts" / path[String]("id") / "deposit")
    .in(jsonBody[AmountRequest])
    .out(jsonBody[AccountResponse])

  case class AmountRequest(amount: BigDecimal)

  val all: List[AnyEndpoint] = List(openAccount, getAccount, deposit)
```

## 6. Main

```scala
package com.example.bank

import cats.effect.*
import com.example.bank.api.Endpoints
import com.example.bank.repo.InMemoryAccountRepo
import com.example.bank.service.AccountServiceImpl
import org.http4s.ember.server.EmberServerBuilder
import sttp.tapir.server.http4s.Http4sServerInterpreter

object Main extends IOApp.Simple:
  def run: IO[Unit] =
    for
      repo    <- IO(InMemoryAccountRepo())
      service = AccountServiceImpl(repo)
      _ <- EmberServerBuilder
        .default[IO]
        .withPort(8080)
        .withHttpApp(Http4sServerInterpreter[IO]().toWebSocketService ?? // ...
          Http4sServerInterpreter[IO]().toRoutes(Endpoints.all)(/* handler */).orNotFound
        )
        .build
        .use(_ => IO.never)
    yield ()
```

## 7. 测试

```scala
package com.example.bank.service

import cats.effect.*
import com.example.bank.domain.*
import com.example.bank.repo.InMemoryAccountRepo
import munit.CatsEffectSuite

class AccountServiceSpec extends CatsEffectSuite:
  val repo    = InMemoryAccountRepo()
  val service = AccountServiceImpl(repo)

  test("deposit increases balance") {
    for
      id      <- service.open(Money(100))
      _       <- service.deposit(id, Money(50))
      balance <- service.balance(id)
    yield assert(balance.amount == BigDecimal(150))
  }

  test("withdraw decreases balance") {
    for
      id      <- service.open(Money(100))
      _       <- service.withdraw(id, Money(30))
      balance <- service.balance(id)
    yield assert(balance.amount == BigDecimal(70))
  }

  test("withdraw more than balance fails") {
    for
      id      <- service.open(Money(100))
      attempt <- service.withdraw(id, Money(200)).attempt
    yield assert(attempt.isLeft)
  }

  test("transfer moves money between accounts") {
    for
      a      <- service.open(Money(100))
      b      <- service.open(Money(50))
      _      <- service.transfer(a, b, Money(30))
      balA   <- service.balance(a)
      balB   <- service.balance(b)
    yield
      assert(balA.amount == BigDecimal(70))
      assert(balB.amount == BigDecimal(80))
  }
```

## 8. 进阶练习

完成基础版后,试:

1. **并发测试** —— 同时 1000 笔 deposit,检查余额正确
2. **乐观锁** —— 用版本号防止并发冲突
3. **限流** —— 每秒最多 10 笔交易
4. **事件溯源** —— 用事件流重建余额
5. **CQRS** —— 读模型与写模型分离
6. **HTTP 客户端** —— 用 tapir 写一个其他系统调用本系统的 SDK
7. **OpenAPI 文档** —— 用 tapir 自动生成

## 9. 评分标准

| 维度 | 5 分 | 3 分 | 1 分 |
|------|------|------|------|
| 类型安全 | 全程类型驱动,无 cast | 大部分有类型,几处 cast | 大量 `asInstanceOf` |
| 不可变 | 全部 val | 偶有 var | var / mutable.Map |
| 错误处理 | 用 Either,IO 兜底 | Try + Either 混用 | 抛异常为主 |
| 并发 | 用 Ref / 不可变 | 用 AtomicRef | 用 synchronized |
| 测试 | 属性 + 单元 + 集成 | 单元 + 集成 | 单元 |
| 命名 | 一致、可读 | 基本一致 | 混乱 |

## 10. 进一步

完成 M25 后:
- 用 `doobie` 替换 `InMemoryAccountRepo`
- 用 `refined` 表达 `NonNegative[BigDecimal]`
- 用 `fs2-kafka` 发布事件
- 用 `Monocle` 操作 Account 状态
- 用 `weaver` 替换 MUnit

## 11. 检查清单

- [ ] 写出完整的领域模型
- [ ] 实现 AccountService
- [ ] 写 HTTP 路由
- [ ] 写测试覆盖所有业务规则
- [ ] 解释为什么用 IO 不用 Future
- [ ] 解释为什么用 Money 这种 opaque type
- [ ] 解释并发安全怎么保证
