package com.learning.`19_concurrency_deep`.v2

import scala.concurrent.{ExecutionContext, Future, Promise}
import scala.util.{Failure, Success}

/**
 * M19 —— 并发深度(Scala 2 版)。
 *
 * 不依赖 cats-effect,实现一个"简化版 IO",展示 IO 的核心思想:
 *   - IO[A] 是"计算的描述,未启动"
 *   - flatMap 是顺序组合
 *   - parMapN 是并行组合
 *   - unsafeRunSync 显式触发
 *
 * 注意:为了与 Scala 2 协变类型良好协作,case 类的类型参数用与父类不同的名字;
 * 真实生产请用 cats-effect。
 */
object IO {

  // -------------------------------------------------------------------------
  // IO 数据类型
  // -------------------------------------------------------------------------
  sealed trait IO[+A] {
    self =>
    def flatMap[B](f: A => IO[B]): IO[B] = IO.FlatMap(self, f)
    def map[B](f: A => B): IO[B] = flatMap(a => IO.pure(f(a)))

    def attempt: IO[Either[Throwable, A]] =
      IO.Attempt(self)

    def handleErrorWith(f: Throwable => IO[A]): IO[A] =
      IO.HandleErrorWith(self, f)

    def unsafeRunSync(): A = IO.unsafeRun(this, ExecutionContext.global)
  }

  object IO {
    case class Pure[A](value: A) extends IO[A]
    case class Delay[A](thunk: () => A) extends IO[A]
    case class FlatMap[A, B](source: IO[A], f: A => IO[B]) extends IO[B]
    case class Attempt[A](source: IO[A]) extends IO[Either[Throwable, A]]
    case class HandleErrorWith[A](source: IO[A], f: Throwable => IO[A]) extends IO[A]
    case class Async[A](register: (Either[Throwable, A] => Unit) => Unit) extends IO[A]

    def pure[A](a: A): IO[A] = Pure(a)
    def apply[A](thunk: => A): IO[A] = Delay(() => thunk)
    def raiseError[A](e: Throwable): IO[A] = Async(_(Left(e)))
    def async[A](register: (Either[Throwable, A] => Unit) => Unit): IO[A] = Async(register)

    def fromFuture[A](fa: Future[A]): IO[A] = async { cb =>
      fa.onComplete {
        case Success(a) => cb(Right(a))
        case Failure(e) => cb(Left(e))
      }
    }

    // -------------------------------------------------------------------------
    // 不安全地执行
    // -------------------------------------------------------------------------
    def unsafeRun[A](io: IO[A], ec: ExecutionContext): A = io match {
      case Pure(a)            => a
      case Delay(thunk)       => thunk()
      case FlatMap(source, f) =>
        val a = unsafeRun(source, ec)
        unsafeRun(f(a), ec)
      case Attempt(source) =>
        try Right(unsafeRun(source, ec))
        catch { case e: Throwable => Left(e) }
      case HandleErrorWith(source, f) =>
        try unsafeRun(source, ec)
        catch { case e: Throwable => unsafeRun(f(e), ec) }
      case Async(register) =>
        val p = Promise[A]()
        register {
          case Right(a) => p.success(a)
          case Left(e)  => p.failure(e)
        }
        scala.concurrent.Await.result(p.future, scala.concurrent.duration.Duration.Inf)
    }
  }

  // -------------------------------------------------------------------------
  // 并行:用 Future 实现 parMapN
  // -------------------------------------------------------------------------
  def parMapN[A, B, C](ia: IO[A], ib: IO[B])(f: (A, B) => C)(implicit ec: ExecutionContext): IO[C] =
    IO.fromFuture {
      val fa = Future(ia.unsafeRunSync())(ec)
      val fb = Future(ib.unsafeRunSync())(ec)
      for {
        a <- fa
        b <- fb
      } yield f(a, b)
    }

  // -------------------------------------------------------------------------
  // 资源管理:简化版 Resource
  // -------------------------------------------------------------------------
  case class Resource[+A](acquire: IO[A], release: A => IO[Unit]) {
    def use[B](f: A => IO[B]): IO[B] =
      acquire.flatMap { a =>
        try f(a)
        catch {
          case e: Throwable =>
            release(a).unsafeRunSync()
            throw e
        }
      }
  }

  // -------------------------------------------------------------------------
  // 端到端
  // -------------------------------------------------------------------------
  def run(): Unit = {
    val program: IO[Int] = for {
      a <- IO(40)
      b <- IO(2)
      c <- IO {
        Thread.sleep(10)
        a + b
      }
    } yield c

    val result = program.unsafeRunSync()
    assert(result == 42)

    // 错误处理
    val fail: IO[Int] = IO.raiseError(new RuntimeException("boom"))
    val handled = fail.handleErrorWith(_ => IO.pure(0))
    assert(handled.unsafeRunSync() == 0)

    // attempt
    val attempted = IO(throw new RuntimeException("nope")).attempt.unsafeRunSync()
    assert(attempted.isLeft)

    // parMapN
    val parallel = parMapN(IO(10), IO(20))(_ + _)
    assert(parallel.unsafeRunSync() == 30)

    // async
    val asyncIO: IO[Int] = IO.async { cb => cb(Right(42)) }
    assert(asyncIO.unsafeRunSync() == 42)

    println("M19 IO demo (Scala 2) passed.")
  }
}
