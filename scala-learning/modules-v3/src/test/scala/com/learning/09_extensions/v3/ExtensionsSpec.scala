package com.learning.`09_extensions`.v3

import org.scalatest.funsuite.AnyFunSuite

class ExtensionsSpec extends AnyFunSuite {
  // extension 顶级定义,无需 import;在同包内可见

  test("Int.times") {
    var sum = 0
    5.times { i => sum += i }
    assert(sum == 0 + 1 + 2 + 3 + 4)
  }

  test("String.toSnake") {
    assert("UserNameX".toSnake == "_user_name_x")
    assert("already_lower".toSnake == "already_lower")
  }

  test("String.words / takeRight") {
    assert("hello world foo".words == List("hello", "world", "foo"))
    assert("Scala3".takeRight(2) == "la3")
  }

  test("List.second / secondOr") {
    assert(List(1, 2, 3).second.contains(2))
    assert(List.empty[Int].second.isEmpty)
    assert(List(1).secondOr(99) == 99)
  }

  test("List.isSorted") {
    import scala.math.Ordering.Int
    assert(List(1, 2, 3, 4).isSorted)
    assert(!List(3, 1, 2).isSorted)
    assert(List(1).isSorted)
    assert(List.empty[Int].isSorted)
  }
}
