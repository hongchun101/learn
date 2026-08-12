package com.learning.`19_concurrency_deep`.v3

import scala.concurrent.{ExecutionContext, Future, Promise}
import scala.util.{Failure, Success}

/**
 * M19 —— 并发深度(Scala 3 版)。
 *
 * 简化版 IO,展示 IO 的核心思想。
 * 与 Scala 2 版的区别:Scala 3 用 enum 表达 ADT,语法更紧凑。
 *
 * 注意:为了避免 enum case 引入 type parameter 的复杂性,
 * 本演示省略 Attempt / HandleErrorWith / Async 的对外工厂;
 * 实际生产请用 cats-effect 的 IO。
 */
object IO:

  // -------------------------------------------------------------------------
  // IO 数据类型(Scala 3 用 enum)
  // -------------------------------------------------------------------------
  enum IO[+A]:
    case Pure(value: A)
    case Delay(thunk: () => A)
    case FlatMap[A, B](source: IO[A], f: A => IO[B]) extends IO[B]
    case Fail(error: Throwable)                       extends IO[Nothing]

    def flatMap[B](f: A => IO[B]): IO[B] = IO.FlatMap(this, f)
    def map[B](f: A => B): IO[B] = flatMap(a => IO.pure(f(a)))

    def attempt: IO[Either[Throwable, A]] =
      IO.fromEither(this.unsafeRunSyncAttempt())

    def handleErrorWith(f: Throwable => IO[A]): IO[A] =
      this.attempt.flatMap {
        case Right(a) => IO.pure(a)
        case Left(e)  => f(e)
      }

    def unsafeRunSync()(using ec: ExecutionContext): A = IO.unsafeRun(this, ec)

    // 内部:尝试执行并返回 Either
    private def unsafeRunSyncAttempt()(using ec: ExecutionContext): Either[Throwable, A] =
      try Right(IO.unsafeRun(this, ec))
      catch case e: Throwable => Left(e)

  object IO:
    def pure[A](a: A): IO[A] = Pure(a)
    def apply[A](thunk: => A): IO[A] = Delay(() => thunk)
    def raiseError[A](e: Throwable): IO[A] = Fail(e)

    def fromFuture[A](fa: Future[A]): IO[A] = async(fa)

    /** 异步:把 Future 包装成 IO。 */
    def async[A](fa: => Future[A]): IO[A] = Delay { () =>
      import scala.concurrent.Await
      import scala.concurrent.duration.Duration
      Await.result(fa, Duration.Inf)
    }

    private def fromEither[A](e: Either[Throwable, A]): IO[Either[Throwable, A]] =
      Delay(() => e)

    // -------------------------------------------------------------------------
    // 不安全地执行
    // -------------------------------------------------------------------------
    def unsafeRun[A](io: IO[A], ec: ExecutionContext): A = io match
      case Pure(a)            => a
      case Delay(thunk)       => thunk()
      case FlatMap(source, f) =>
        val a = unsafeRun(source, ec)
        unsafeRun(f(a), ec)
      case Fail(e)            => throw e

  // -------------------------------------------------------------------------
  // 并行
  // -------------------------------------------------------------------------
  def parMapN[A, B, C](ia: IO[A], ib: IO[B])(f: (A, B) => C)(using ec: ExecutionContext): IO[C] =
    IO.fromFuture {
      val fa = Future(ia.unsafeRunSync())(ec)
      val fb = Future(ib.unsafeRunSync())(ec)
      for
        a <- fa
        b <- fb
      yield f(a, b)
    }

  // -------------------------------------------------------------------------
  // Resource(简化)
  // -------------------------------------------------------------------------
  case class Resource[+A](acquire: IO[A], release: A => IO[Unit]):
    def use[B](f: A => IO[B]): IO[B] =
      acquire.flatMap { a =>
        try f(a)
        catch
          case e: Throwable =>
            release(a).unsafeRunSync()
            throw e
      }

  // -------------------------------------------------------------------------
  // 端到端
  // -------------------------------------------------------------------------
  def run()(using ec: ExecutionContext): Unit =
    val program: IO[Int] = for
      a <- IO(40)
      b <- IO(2)
      c <- IO {
        Thread.sleep(10)
        a + b
      }
    yield c

    assert(program.unsafeRunSync() == 42)

    val fail: IO[Int] = IO.raiseError(new RuntimeException("boom"))
    val handled = fail.handleErrorWith(_ => IO.pure(0))
    assert(handled.unsafeRunSync() == 0)

    val attempted = IO(throw new RuntimeException("nope")).attempt.unsafeRunSync()
    assert(attempted.isLeft)

    val parallel = parMapN(IO(10), IO(20))(_ + _)
    assert(parallel.unsafeRunSync() == 30)

    println("M19 IO demo (Scala 3) passed.")
