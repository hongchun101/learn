package com.learning.`00_expressiveness`.v2

import org.scalatest.funsuite.AnyFunSuite

class ExpressivenessSpec extends AnyFunSuite {
  import Expressiveness._

  test("sealed trait + match") {
    assert(getStatus(200) == Ok)
    assert(getStatus(404) == NotFound)
    assert(getStatus(500) == Unknown(500))
  }

  test("Option 代替 null") {
    assert(findUserEmail(User(Some("ada@x"))) == "ada@x")
    assert(findUserEmail(User(None)) == "anonymous")
  }

  test("match 代替 instanceof") {
    assert(area(Circle(1.0)) > 3.14 && area(Circle(1.0)) < 3.15)
    assert(area(Rectangle(2, 3)) == 6.0)
  }

  test("implicit class 扩展方法") {
    import StringOps
    assert("UserName".toSnake == "_user_name")
  }

  test("类型类 Show") {
    import Show._
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
