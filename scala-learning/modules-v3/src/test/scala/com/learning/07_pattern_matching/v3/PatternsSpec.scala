package com.learning.`07_pattern_matching`.v3

import org.scalatest.funsuite.AnyFunSuite

class PatternsSpec extends AnyFunSuite {
  import Patterns.*

  test("基本匹配") {
    assert(describe(0) == "zero")
    assert(describe(2) == "even 2")
    assert(describe(3) == "int 3")
    assert(describe("x") == "string x")
  }

  test("元组 / 序列") {
    assert(describe((1, 2)) == "tuple 1 2")
    assert(describe(List(1, 2, 3)) == "starts 1,2")
    assert(describe(List(0, 1, 2)) == "starts 0, then 2")
    assert(describe(List.empty) == "empty list")
  }

  test("自定义 case class + 守卫") {
    assert(describe(Person("ada", 36)) == "adult ada")
    assert(describe(Person("kid", 10)) == "minor kid")
  }

  test("unapplySeq Split 提取器") {
    val xs = "a,b,c,d" match
      case Split(a, b, rest @ _*) => (a, b, rest.toList)
    assert(xs == ("a", "b", List("c", "d")))
  }

  test("Option") {
    assert(describe(Some(1)) == "option")
    assert(describe(None) == "option")
  }
}
