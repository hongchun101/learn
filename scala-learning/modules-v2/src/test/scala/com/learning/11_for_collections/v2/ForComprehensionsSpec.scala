package com.learning.`11_for_collections`.v2

import org.scalatest.funsuite.AnyFunSuite

class ForComprehensionsSpec extends AnyFunSuite {
  import ForComprehensions._

  test("Either for 串行") {
    assert(safeDivChain(100, 5, 2) == Right(10))
    assert(safeDivChain(100, 0, 2).isLeft)
    assert(safeDivChain(100, 5, 0).isLeft)
  }

  test("for + 守卫") {
    assert(pairsAndSums(List(1, 2, 3), List(1, 2)) == List(2, 4, 4))
  }

  test("自定义 Wrap for") {
    assert(wrapped.value == 30)
  }

  test("Stream 懒序列") {
    assert(firstTenSquares == Vector(1, 4, 9, 16, 25, 36, 49, 64, 81, 100))
  }
}
