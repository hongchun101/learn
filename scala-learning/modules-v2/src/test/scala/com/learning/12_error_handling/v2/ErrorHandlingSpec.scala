package com.learning.`12_error_handling`.v2

import org.scalatest.funsuite.AnyFunSuite
import scala.util.{Success, Failure}

class ErrorHandlingSpec extends AnyFunSuite {
  import ErrorHandling._

  test("Try 包装异常") {
    assert(parseInt("42") == Success(42))
    assert(parseInt("abc").isFailure)
  }

  test("Either 显式错误") {
    assert(loadUser(1).contains("User#1"))
    assert(loadUser(-1).left.toOption.exists(_.isInstanceOf[NotFound]))
    assert(loadUser(0) == Left(Unauthorized))
  }

  test("Either for 推导") {
    assert(workflow(1, "10") == Right(11))
    assert(workflow(-1, "10").isLeft)
    assert(workflow(1, "abc").isLeft)
  }

  test("scala.util.control.Exception.catching DSL") {
    assert(safeParseInt("42") == Right(42))
    assert(safeParseInt("abc").isLeft)
  }

  test("Try 收集") {
    assert(multiStep(List("1", "2", "3")) == Success(6))
    assert(multiStep(List("1", "x")).isFailure)
  }

  test("NonFatal") {
    val oom = new OutOfMemoryError("boom")
    val npe = new NullPointerException
    assert(isFatal(oom))
    assert(!isFatal(npe))
  }
}
