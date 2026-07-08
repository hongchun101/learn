package com.learning.`13_concurrency`.v2

import org.scalatest.funsuite.AnyFunSuite

class ConcurrencySpec extends AnyFunSuite {
  import Concurrency._

  test("Future 异步加法") {
    val f = addAsync(3, 4)
    assert(await(f) == 7)
  }

  test("Future.traverse 组合") {
    val f = combine(List(1, 2, 3, 4, 5))
    assert(await(f) == 20) // 1+1 + 2+1 + 3+1 + 4+1 + 5+1 = 6+7+8+9+10 - 5 (重复 1) → 1+2+3+4+5+5=20
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
