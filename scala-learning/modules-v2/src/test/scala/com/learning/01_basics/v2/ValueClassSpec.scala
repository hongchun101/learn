package com.learning.`01_basics`.v2

import org.scalatest.funsuite.AnyFunSuite

class ValueClassSpec extends AnyFunSuite {

  test("字符串插值含三类前缀") {
    val out = BasicsDemo.interpolate("ada", 36)
    assert(out.contains("name=ada"))
    assert(out.contains("age=0036"))
    assert(out.contains("a\\nb")) // raw 字符串不转义
  }

  test("implicit class RichInt 扩展方法") {
    import BasicsDemo.RichInt
    assert(3.doubled == 6)
    assert(4.squared == 16)
  }

  test("隐式上下文约束 + 上下文绑定") {
    import BasicsDemo._
    assert(max(1, 2) == 2)
    assert(max("b", "a") == "b")
    assert(sortedFirst(List(3, 1, 4, 1, 5, 9, 2, 6)) == 9)
  }

  test("值类 UserId 编译期零开销") {
    val a = UserId.unsafe(42L)
    val b = UserId.unsafe(42L)
    assert(a.raw == 42L)
    assert(a == b) // 值类自动生成 equals
    assert(UserId.parse("123").contains(UserId.unsafe(123)))
    assert(UserId.parse("abc").isEmpty)
  }

  test("@specialized 不丢失类型") {
    import SpecializationDemo.identity
    val a: Int    = identity(42)
    val b: Long   = identity(42L)
    val c: Double = identity(3.14)
    assert(a == 42 && b == 42L && c == 3.14)
  }
}
