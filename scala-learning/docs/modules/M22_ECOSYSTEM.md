# M22 生态选型

> Phase 3 高级模块。Scala 生态是它"难学"的另一面——库太多。
> 本章是常用库的"选型指南"。

## 1. 基础库

| 库 | 用途 | 推荐度 |
|-----|------|--------|
| `cats` | FP 抽象(Functor/Monad/Traverse) | ★★★★★ |
| `cats-effect` | IO、Ref、Resource | ★★★★★ |
| `fs2` | 纯函数式流 | ★★★★★ |
| `http4s` | 类型安全的 HTTP | ★★★★ |
| `circe` | JSON 编解码 | ★★★★★ |
| `doobie` | 类型安全的 JDBC | ★★★★ |
| `tapir` | 类型安全的 HTTP API/客户端 | ★★★★★ |
| `refined` | 编译期数据校验 | ★★★★ |
| `monocle` | Optics(Lens/Prism/Traversal) | ★★★ |
| `spire` | 高质量数值类型 | ★★ |
| `scalacheck` | 属性测试 | ★★★★ |
| `weaver` | 类型安全的测试框架 | ★★★ |
| `munit` | 简洁的测试框架 | ★★★★ |
| `logback` | 日志 | ★★★★★ |
| `pureconfig` | 配置 | ★★★ |
| `ciris` | 配置(cats-effect 风格) | ★★★ |
| `redis4cats` | Redis 客户端 | ★★★ |
| `fs2-kafka` | Kafka 客户端 | ★★★ |

## 2. cats 入门

```scala
// build.sbt
"org.typelevel" %% "cats-core" % "2.10.0"
"org.typelevel" %% "cats-effect" % "3.5.4"
```

```scala
import cats.*
import cats.syntax.all.*

// Functor
Option(1).map(_ + 1)        // Some(2)

// Applicative:并行组合
val f: Option[Int] = (Option(1), Option(2), Option(3)).mapN(_ + _ + _)

// Monad:链式
for
  a <- Option(1)
  b <- Option(2)
yield a + b
```

**何时用 cats?**
- 想要"与任何 F 协作"的代码
- 想要"标准化的 FP 词汇"(Functor/Monad)
- 不想要 IO 时仍要类型类

## 3. cats-effect 入门

```scala
import cats.effect.*

val program: IO[Unit] = for
  _ <- IO.println("hello")
  _ <- IO.println("world")
yield ()

object Main extends IOApp.Simple:
  def run: IO[Unit] = program
```

**IOApp** 自动管理 `unsafeRunSync`,在 main 线程跑完所有 IO。

**何时用 IO?**
- 异步操作
- 资源管理
- 任何含副作用的计算

## 4. fs2 入门

```scala
import fs2.*
import fs2.io.file.*

val stream: Stream[IO, String] = Stream.emits(List("a", "b", "c"))

val transformed: Stream[IO, String] = stream
  .filter(_.nonEmpty)
  .map(_.toUpperCase)
  .evalTap(IO.println)

val effect: IO[Unit] = transformed.compile.toList.flatMap(IO.println)
```

**何时用 fs2?**
- 数据流(Kafka、日志、CSV)
- 异步管道
- 替代 Akka Streams(简单场景)

## 5. http4s 入门

```scala
import cats.effect.*
import org.http4s.*
import org.http4s.dsl.io.*
import org.http4s.ember.server.*
import org.http4s.implicits.*

object HelloServer extends IOApp.Simple:
  def run: IO[Unit] =
    EmberServerBuilder
      .default[IO]
      .withHttpApp(Routes.of {
        case GET -> Root / "hello" / name => Ok(s"hello, $name")
      }.orNotFound)
      .build
      .use(_ => IO.never)
```

**何时用 http4s?**
- 想要类型安全的 HTTP 路由
- 想要纯函数式 HTTP
- 微服务后端

## 6. circe 入门

```scala
import io.circe.*
import io.circe.generic.auto.*
import io.circe.syntax.*

case class User(name: String, age: Int)

val u = User("ada", 36)
val json: Json = u.asJson
val str: String = json.noSpaces
// {"name":"ada","age":36}

val parsed: Either[Error, User] = str.asJson.as[User]
```

**何时用 circe?**
- JSON 序列化
- 想要自动派生
- 想要高性能

## 7. tapir 入门

```scala
import sttp.tapir.*
import sttp.tapir.server.http4s.Http4sServerInterpreter
import cats.effect.*

case class User(id: Long, name: String)

val getUserEndpoint = endpoint
  .get
  .in("users" / path[Long]("id"))
  .out(jsonBody[User])

val routes = Http4sServerInterpreter[IO]().toRoutes(getUserEndpoint) { id =>
  IO.pure(User(id, s"user-$id"))
}
```

**何时用 tapir?**
- 想要"端点即类型"
- 想要自动生成 OpenAPI 文档
- 想要"前后端共享 schema"

## 8. doobie 入门

```scala
import doobie.*
import doobie.implicits.*

val xa: Transactor[IO] = Transactor.fromDriverManager[IO](
  "org.postgresql.Driver",
  "jdbc:postgresql://localhost/test",
  "user", "pass"
)

val users: IO[List[User]] = sql"SELECT id, name FROM users".query[User].to[List].transact(xa)
```

**何时用 doobie?**
- 想要"类型安全的 SQL"
- 想要 cats-effect 集成
- 不用 ORM

## 9. 选型决策树

```
你要做 Web 服务?
  ├─ 类型安全 / FP 风格 → http4s + tapir
  ├─ 简单 / 学习曲线低 → Play / Akka HTTP
  └─ Spark / 数据 → 不需要

你要做 JSON?
  ├─ 自动派生 / 主流 → circe
  └─ 高性能 / 极端场景 → upickle / jawn

你要做数据库?
  ├─ 类型安全 / SQL 写明 → doobie
  └─ ORM 风格 → Quill / Slick

你要做并发?
  ├─ 新项目 / FP 风格 → cats-effect IO
  └─ 旧项目 / Akka → Future / Actor

你要做流?
  ├─ 简单 / 与 IO 集成 → fs2
  └─ 与 Akka 集成 → Akka Streams
```

## 10. 不要"装全套"

**反例**:新人项目里同时引入 cats、cats-effect、circe、doobie、http4s、tapir、fs2、refined、monocle、pureconfig、spire……

**正例**:
- 业务初期:cats、cats-effect、circe
- 业务增长:按需加 http4s、doobie
- 业务复杂:加 tapir、fs2
- 业务稳定:加 refined、monocle 解决特定问题

**原则**:**用你真的需要的**。每加一个库,意味着团队所有人都要学。

## 11. 版本与兼容性

| Scala | cats | cats-effect | circe | http4s |
|-------|------|-------------|-------|--------|
| 2.13.x | 2.10 | 3.5 | 0.14 | 0.23 |
| 3.3.x | 2.10 | 3.5 | 0.14 | 0.23 |

**cross-build**:
```scala
// build.sbt
lazy val core = (crossProject.crossType(CrossType.Pure) in file("core"))
  .crossType(CrossType.Pure)
  .settings(...)
```

## 12. 检查清单

- [ ] 说出 5 个最常用的 Scala 库
- [ ] 解释 cats / cats-effect / fs2 的角色差异
- [ ] 用 circe 序列化一个 case class
- [ ] 写一个 http4s 路由
- [ ] 解释 tapir 解决什么问题
- [ ] 解释 doobie 与 ORM 的差异
- [ ] 解释为什么"不要装全套"
