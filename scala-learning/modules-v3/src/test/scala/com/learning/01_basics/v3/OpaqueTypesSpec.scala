package com.learning.`01_basics`.v3

import org.scalatest.funsuite.AnyFunSuite

class OpaqueTypesSpec extends AnyFunSuite {

  test("字符串插值与原生字符串") {
    val out = BasicsDemo.interpolate("ada", 36)
    assert(out.contains("name=ada"))
    assert(out.contains("age=0036"))
    assert(out.contains("a\\nb"))
  }

  test("opaque type 文件外不可见 Long") {
    // 类型不可见,只能通过 companion 构造/解构
    val id: UserIdModule.UserId = UserIdModule.UserId(42L)
    assert(UserIdModule.UserId.raw(id) == 42L)
    assert(UserIdModule.nextId(id) == 43L)
    assert(UserIdModule.UserId.parse("123").contains(UserIdModule.UserId(123L)))
    assert(UserIdModule.UserId.parse("abc").isEmpty)
  }

  test("transparent inline 暴露精确值") {
    // 编译后应等价于字符串字面量
    val v: String = Constants.scalaVersion
    assert(v == "3.3.3")
    assert(Constants.platform.nonEmpty)
  }

  test("Matchable 允许 pattern match 任意具体类型") {
    assert(MatchableDemo.describe("x") == "String: x")
    assert(MatchableDemo.describe(7) == "Int: 7")
    assert(MatchableDemo.describe(3.14) == "other")
  }
}
