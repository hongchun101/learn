package com.learning.`14_macros_meta`.v3

import org.scalatest.funsuite.AnyFunSuite

class InlineMetaSpec extends AnyFunSuite {
  import InlineMeta.*

  test("inline 展开") {
    val r = twice(21)
    assert(r == 42)
  }

  test("transparent inline defaultValue") {
    val i: Int     = defaultValue[Int]
    val s: String  = defaultValue[String]
    val b: Boolean = defaultValue[Boolean]
    assert(i == 0 && s == "" && b == false)
  }

  test("assertPositive 正数通过") {
    assertPositive(1)
  }

  test("constValueOf 编译期常量化") {
    val v: Int = constValueOf[42]
    assert(v == 42)
  }

  test("tupleSize 编译期计数") {
    assert(tupleSize[EmptyTuple] == 0)
    assert(tupleSize[(Int, String)] == 2)
    assert(tupleSize[(Int, String, Boolean, Double)] == 4)
  }

  test("platformCheck") {
    val p = platformCheck
    assert(p == "mac" || p == "other")
  }

  test("sumOf 递归展开") {
    val s = sumOf(List(1, 2, 3, 4, 5))
    assert(s == 15)
  }

  test("requireOrdering 拉取隐式") {
    given scala.math.Ordering[Int] = summon[scala.math.Ordering[Int]]
    val ord = requireOrdering[Int]
    assert(ord.compare(1, 2) < 0)
  }
}
