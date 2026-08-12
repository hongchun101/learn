package com.learning.`00_expressiveness`.v3

import org.scalatest.funsuite.AnyFunSuite

class ExpressivenessSpec extends AnyFunSuite {
  import Expressiveness.*

  test("enum + match") {
    assert(getStatus(200) == Status.Ok)
    assert(getStatus(404) == Status.NotFound)
    assert(getStatus(500) == Status.Unknown(500))
  }

  test("Option 代替 null") {
    assert(findUserEmail(User(Some("ada@x"))) == "ada@x")
    assert(findUserEmail(User(None)) == "anonymous")
  }

  test("match 代替 instanceof") {
    assert(area(Shape.Circle(1.0)) > 3.14 && area(Shape.Circle(1.0)) < 3.15)
    assert(area(Shape.Rectangle(2, 3)) == 6.0)
  }

  test("extension 扩展方法") {
    assert("UserName".toSnake == "_user_name")
  }

  test("类型类 Show") {
    import Show.given
    assert(show(42) == "42")
    assert(show("hi") == "\"hi\"")
  }

  test("for 在 Option") {
    assert(workflow(100, 5, 2) == Some(10))
    assert(workflow(100, 0, 2).isEmpty)
  }

  test("端到端 demo 通过") {
    run()
  }
}
