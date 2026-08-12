package com.learning.`19_concurrency_deep`.v2

import org.scalatest.funsuite.AnyFunSuite
import scala.concurrent.ExecutionContext.Implicits.global

class IOSpec extends AnyFunSuite {
  import IO._

  test("pure 立即返回值") {
    assert(IO.pure(42).unsafeRunSync() == 42)
  }

  test("flatMap 顺序") {
    val p = for {
      a <- IO(1)
      b <- IO(2)
    } yield a + b
    assert(p.unsafeRunSync() == 3)
  }

  test("错误处理") {
    val fail: IO[Int] = IO.raiseError(new RuntimeException("boom"))
    val handled = fail.handleErrorWith(_ => IO.pure(0))
    assert(handled.unsafeRunSync() == 0)
  }

  test("attempt") {
    val attempted = IO(throw new RuntimeException("nope")).attempt.unsafeRunSync()
    assert(attempted.isLeft)
  }

  test("parMapN") {
    val parallel = parMapN(IO(10), IO(20))(_ + _)
    assert(parallel.unsafeRunSync() == 30)
  }

  test("async") {
    val asyncIO: IO[Int] = IO.async { cb => cb(Right(42)) }
    assert(asyncIO.unsafeRunSync() == 42)
  }

  test("end-to-end demo") {
    run()
  }
}
