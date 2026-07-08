package com.learning.`13_concurrency`.v3

import org.scalatest.funsuite.AnyFunSuite

class ConcurrencySpec extends AnyFunSuite {
  import Concurrency.*
  import Concurrency.given

  test("Future 异步加法") {
    val f = addAsync(3, 4)
    assert(await(f) == 7)
  }

  test("Future.traverse 组合") {
    val f = combine(List(1, 2, 3, 4, 5))
    assert(await(f) == 20)
  }

  test("recover 失败恢复") {
    assert(await(safeDivide(10, 0)) == 0)
    assert(await(safeDivide(10, 2)) == 5)
  }

  test("并行集合 par") {
    val xs = Vector(1, 2, 3, 4)
    assert(parallelMap(xs, _ * 2) == Vector(2, 4, 6, 8))
  }
}
