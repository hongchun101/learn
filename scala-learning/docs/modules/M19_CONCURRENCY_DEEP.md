# M19 并发深度

> Phase 3 核心模块。Scala 的并发模型是它最强的竞争力之一。
> 学完这章,你能用类型系统**约束**并发,而不是"靠注释"。

## 1. Future 的问题

`Future[A]` 是 Scala 2 的"标准"异步类型,但它**有严重缺陷**:

```scala
def fetchUser(id: Long): Future[User] = ???

val f: Future[User] = fetchUser(42)
// 此时 f 已经在运行了!你无法控制它何时执行、是否取消。
```

### 问题 1:不可控的执行时机

```scala
val f = Future {
  println("running!")
  42
}
// 你以为控制何时打印?不,Future 一被创建就跑。
```

### 问题 2:不可取消

```scala
val f = Future {
  while (true) doSomething()  // 无法中断
  42
}
```

### 问题 3:参照不透明

```scala
val a: Future[Int] = Future.successful(1)
// 已经在另一个线程跑完了;你不知道当前是哪个线程
```

### 问题 4:错误不强制处理

```scala
val f: Future[Int] = Future(throw new Exception("boom"))
f.foreach(println)
// 没异常输出,因为 f 已经"失败"了,需要 recover 或 onComplete
```

### 问题 5:不可组合

```scala
val f: Future[Int] = ...
val s: String = f.map(_.toString)
// ^ 这是 Future[String],不是 String
// 你无法"在同步代码里"用 f 的值
```

## 2. IO:cats-effect 的解法

`IO[A]` 是 cats-effect 提供的一个**描述性**类型。它是"一段还未执行的计算"。

```scala
import cats.effect.IO

val program: IO[Int] = IO {
  println("running!")  // 还没跑
  42
}
program.unsafeRunSync()  // 现在才跑
```

### 优势

1. **可控执行**:`unsafeRunSync` 显式启动
2. **可取消**:底层用 `Fiber`,能取消
3. **参照透明**:`IO[A]` 是值,函数返回它不跑
4. **错误处理**:`IO.raiseError` / `IO.handleErrorWith`
5. **资源管理**:`Resource.make` 自动释放
6. **结构化并发**:`IO.parTraverse` / `IO.background` / `IO.race`

## 3. IO 入门

```scala
import cats.effect.*

val program: IO[Unit] = for
  _ <- IO.println("step 1")
  _ <- IO.println("step 2")
  _ <- IO.println("step 3")
yield ()

val io: IO[IO[Unit]] = program.attempt  // 错误捕获后包成 Either
val safe: IO[Unit]   = program.handleError(e => IO.println(s"err: $e"))
```

**纯值升 IO**:
```scala
val a: IO[Int] = IO.pure(42)              // 无副作用
val b: IO[Int] = IO(42)                   // 包装一个表达式
val c: IO[Int] = IO.defer(IO(42))         // 每次"求值"时重新计算
val d: IO[Int] = IO.fromOption(Some(42)) // Option -> IO
val e: IO[Int] = IO.fromEither(Right(42)) // Either -> IO
```

**错误处理**:
```scala
val x: IO[Int] = IO.raiseError(new RuntimeException("boom"))
x.recover { case _: RuntimeException => 0 }   // IO[Int] = 0
x.recoverWith { case _ => IO.pure(0) }
x.orElse(IO.pure(0))
```

## 4. Resource:安全的资源管理

`Resource` 表达"获取 + 释放"的配对。

```scala
import cats.effect.*

def openFile(path: String): Resource[IO, java.io.FileReader] =
  Resource.make {
    IO.blocking(new java.io.FileReader(path))  // acquire
  } { reader =>
    IO.blocking(reader.close())                // release
  }

val program: IO[String] = openFile("data.txt").use { reader =>
  IO.blocking {
    reader.readLine()
  })
```

**优势**:
- **异常安全**:即使 acquire 成功但 use 中抛错,release 也会被调用
- **跨作用域安全**:Resource 借用后不能逃逸(use 块结束就关闭)
- **可嵌套**:`Resource` 本身有 `flatMap`,可以组合

## 5. Ref:并发安全的可变引用

```scala
import cats.effect.*

def counter: IO[Ref[IO, Int]] = Ref.of[IO, Int](0)

val program: IO[Int] = for
  ref <- counter
  _   <- ref.update(_ + 1)
  _   <- ref.update(_ + 1)
  _   <- ref.update(_ + 1)
  v   <- ref.get
yield v
// v = 3
```

**`Ref` 提供的 API**:
- `get: F[A]`
- `set(a: A): F[Unit]`
- `update(f: A => A): F[Unit]`
- `modify[B](f: A => (A, B)): F[B]`
- `updateAndGet(f: A => A): F[A]`
- `getAndUpdate(f: A => A): F[A]`

**为什么不用 AtomicReference?**
- `Ref` 是 cats-effect 的 `F` 上下文,能与 IO 协作
- `AtomicReference` 只在 blocking 代码中安全
- `Ref` 内部用 CAS,等同于 `AtomicReference`,但有正确的 monadic 接口

## 6. 结构化并发

**"结构化并发"** = 子任务的生命周期严格嵌套在父任务中。
子任务不能比父任务"活得更久"。

cats-effect 的 `Resource` + `IO.background` + `IO.race` + `IO.parTraverse` 实现了结构化并发。

### 并行任务

```scala
val fetchA: IO[A] = ???
val fetchB: IO[B] = ???

// 串行
val both1: IO[(A, B)] = for
  a <- fetchA
  b <- fetchB
yield (a, b)

// 并行
val both2: IO[(A, B)] = (fetchA, fetchB).parTupled
//  或 parMapN((a, b) => ...)
```

### 超时与竞态

```scala
import scala.concurrent.duration.*

// 3 秒后超时
val r: IO[Either[A, TimeoutException]] =
  fetchA.attempt.timeout(3.seconds)

// 取第一个完成的
val r2: IO[Either[A, B]] = IO.race(fetchA, fetchB)
```

### 取消

```scala
import cats.effect.unsafe.implicits.global

val cancelable: IO[Unit] = for
  fiber <- slowTask.start
  _     <- IO.sleep(1.second)
  _     <- fiber.cancel
yield ()
```

## 7. 并发原语

### Deferred:一次性承诺

```scala
import cats.effect.kernel.Deferred

def pubsub: IO[Unit] = for
  d <- Deferred[IO, String]
  _ <- (for
    v <- d.get
    _ <- IO.println(s"got: $v")
  yield ()).start
  _ <- IO.sleep(1.second)
  _ <- d.complete("hello")
yield ()
```

### Queue:无锁队列

```scala
import cats.effect.std.Queue

def producerConsumer: IO[Unit] = for
  q <- Queue.unbounded[IO, Int]
  producer = q.offer(42).background  // 后台
  consumer = (q.take *> IO.println("got")).foreverM.background
  _ <- producer.flatMap(_.cancel)
  _ <- consumer.flatMap(_.cancel)
yield ()
```

### Semaphore:信号量

```scala
import cats.effect.kernel.Semaphore

val sem: IO[Semaphore[IO]] = Semaphore[IO](3)  // 3 个并发许可

for
  s <- sem
  _ <- s.permit.use(_ => someOp)
yield ()
```

## 8. cats-effect 与 cats 的关系

- `cats`:提供 `Functor` / `Monad` / `Applicative` 等抽象
- `cats-effect`:在 cats 之上提供 `IO`、`Ref`、`Resource` 等"运行时"实现

**不要把 cats 写成"理论课"**。它是 Scala 生态最实用的库之一。

## 9. 实战:一个 HTTP 调用

```scala
import cats.effect.*
import cats.syntax.all.*
import org.http4s.*
import org.http4s.dsl.io.*
import org.http4s.ember.client.*
import org.http4s.client.*

def client: Resource[IO, Client[IO]] = EmberClientBuilder.default[IO].build

def fetchUser(id: Long): IO[User] = client.use { c =>
  c.expect[User](s"http://api.example.com/users/$id")
}
```

**注意**:
- `client.use` 自动关闭连接
- `c.expect[User]` 需要 `EntityDecoder[User]`(用 circe 自动派生)
- 错误(网络、解码)通过 `IO` 传递

## 10. 实战:Redis 客户端包装

```scala
import dev.profunktor.redis4cats.*
import dev.profunktor.redis4cats.effect.*

def cache[F[_]: Async](key: String): F[Option[String]] =
  Redis[F].utf8.get(key)

def program[F[_]: Async]: F[Unit] =
  for
    v <- cache[IO]("user:42")
    _ <- v match
      case Some(s) => IO.println(s"cached: $s")
      case None    => IO.println("miss")
  yield ()
```

## 11. Future → IO 迁移

把 `Future[A]` 改写为 `IO[A]` 的指南:

| Future 写法 | IO 写法 |
|-------------|---------|
| `Future { ... }` | `IO { ... }` |
| `Future.successful(a)` | `IO.pure(a)` |
| `Future.failed(e)` | `IO.raiseError(e)` |
| `f1.flatMap(f2)` | `f1.flatMap(f2)`(同) |
| `Await.result(f, dur)` | `f.unsafeRunSync()`(仅 main / test) |
| `ExecutionContext` | `IO` 内部处理 |
| `Promise[T]` | `Deferred[IO, T]` |
| `atomic.compareAndSet` | `Ref[IO].modify` |

**`unsafeRunSync` 只在 main / test 用**。其他场景都要组合 `IO`。

## 12. 检查清单

- [ ] 解释 Future 的 5 个核心问题
- [ ] 写出 IO 的 5 个优势
- [ ] 写出 `Resource` 的 acquire / release
- [ ] 解释 `Ref` 与 `AtomicReference` 的差异
- [ ] 解释"结构化并发"
- [ ] 写出一个用 `parTupled` 并行调用 3 个 API 的程序
- [ ] 把一段 Future 代码改写为 IO
