package com.learning.`17_collections_deep`.v3

import org.scalatest.funsuite.AnyFunSuite

class CollectionsDeepSpec extends AnyFunSuite {
  import CollectionsDeep.*

  test("view 与直接链等价") {
    val xs = (1 to 100).toList
    assert(lazySumSquares(xs) == lazySumSquaresView(xs))
  }

  test("LazyList 前 10 平方") {
    assert(firstTenSquares == Vector(1, 4, 9, 16, 25, 36, 49, 64, 81, 100))
  }

  test("foldLeft / foldRight") {
    assert(foldLeftSum(List(1, 2, 3, 4)) == 10)
    assert(foldRightSum(List(1, 2, 3, 4)) == 10)
  }

  test("for on Either") {
    assert(workflow(100, 5, 2) == Right(10))
    assert(workflow(100, 0, 2).isLeft)
    assert(workflow(100, 5, 0).isLeft)
  }

  test("word count") {
    assert(countWords("a b a c b a") == Map("a" -> 3, "b" -> 2, "c" -> 1))
  }

  test("fibs 协递归") {
    assert(fibs.take(7).toList == List(0, 1, 1, 2, 3, 5, 8))
  }

  test("end-to-end demo") {
    run()
  }
}
