package com.learning.`19_concurrency_deep`.v3

import org.scalatest.funsuite.AnyFunSuite
import scala.concurrent.ExecutionContext

class IOSpec extends AnyFunSuite {
  given ec: ExecutionContext = ExecutionContext.global
  import IO.*

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

  test("end-to-end demo") {
    run()
  }
}
