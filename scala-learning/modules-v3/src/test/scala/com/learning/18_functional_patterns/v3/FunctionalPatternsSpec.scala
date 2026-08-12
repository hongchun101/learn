package com.learning.`18_functional_patterns`.v3

import org.scalatest.funsuite.AnyFunSuite

class FunctionalPatternsSpec extends AnyFunSuite {
  import FunctionalPatterns.*

  test("Monoid 求和") {
    assert(combineAll(List(1, 2, 3, 4)) == 10)
  }

  test("Monoid 字符串拼接") {
    assert(combineAll(List("a", "b", "c")) == "abc")
  }

  test("Monoid List 拼接") {
    assert(combineAll(List(List(1), List(2), List(3))) == List(1, 2, 3))
  }

  test("Functor Option") {
    val o: Option[Int] = Some(42)
    assert(optionFunctor.map(o)(_ + 1) == Some(43))
  }

  test("eitherTraverse 全部成功") {
    val r = eitherTraverse(List("1", "2", "3"))(s =>
      scala.util.Try(s.toInt).toEither.left.map(_.getMessage)
    )
    assert(r == Right(List(1, 2, 3)))
  }

  test("eitherTraverse 任意失败短路") {
    val r = eitherTraverse(List("1", "x", "3"))(s =>
      scala.util.Try(s.toInt).toEither.left.map(_.getMessage)
    )
    assert(r.isLeft)
  }

  test("eitherSequence") {
    assert(eitherSequence(List(Right(1), Right(2), Right(3))) == Right(List(1, 2, 3)))
    assert(eitherSequence(List(Right(1), Left("e"), Right(3))).isLeft)
  }

  test("end-to-end demo") {
    run()
  }
}
