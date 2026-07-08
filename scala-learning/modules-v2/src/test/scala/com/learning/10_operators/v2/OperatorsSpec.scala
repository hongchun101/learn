package com.learning.`10_operators`.v2

import org.scalatest.funsuite.AnyFunSuite

class OperatorsSpec extends AnyFunSuite {
  import Operators._

  test("Vec2 加减乘 + 中缀") {
    val a = Vec2(1, 2)
    val b = Vec2(3, 4)
    assert(a + b == Vec2(4, 6))
    assert(b - a == Vec2(2, 2))
    assert(a * 2.0 == Vec2(2, 4))
  }

  test("Vec2 一元负") {
    val a = Vec2(1, -2)
    assert((-a) == Vec2(-1, 2))
  }

  test("Vec2 apply / update 模拟数组访问") {
    val a = Vec2(1.0, 2.0)
    assert(a(0) == 1.0)
    assert(a(1) == 2.0)
    var b = Vec2(0.0, 0.0)
    b(0) = 5.0 // 触发 update
    assert(b == Vec2(5.0, 0.0))
  }

  test("Money + Ordering") {
    import moneyOrdering
    val xs = List(Money(BigDecimal(10), "USD"), Money(BigDecimal(5), "USD"), Money(BigDecimal(20), "USD"))
    assert(xs.max.amount == BigDecimal(20))
  }

  test("Money 不同币种抛异常") {
    val a = Money(BigDecimal(1), "USD")
    val b = Money(BigDecimal(1), "EUR")
    intercept[IllegalArgumentException] { a + b }
  }
}
