package com.learning.`09_extensions`.v2

import org.scalatest.funsuite.AnyFunSuite

class ExtensionsSpec extends AnyFunSuite {
  import Extensions._

  test("Int.times 高阶回调") {
    var sum = 0
    5.times { i => sum += i }
    assert(sum == 0 + 1 + 2 + 3 + 4)
  }

  test("String.toSnake 驼峰转蛇形") {
    assert("UserNameX".toSnake == "_user_name_x")
    assert("already_lower".toSnake == "already_lower")
  }

  test("String.words 拆词") {
    assert("hello world foo".words == List("hello", "world", "foo"))
  }

  test("List.second / secondOr") {
    assert(List(1, 2, 3).second.contains(2))
    assert(List.empty[Int].second.isEmpty)
    assert(List(1).secondOr(99) == 99)
  }

  test("String.isEmail") {
    assert("alice@example.com".isEmail)
    assert(!"not-an-email".isEmail)
  }
}
