package com.learning.`05_typeclasses`.v3

import org.scalatest.funsuite.AnyFunSuite

class TypeClassesSpec extends AnyFunSuite {
  import TypeClasses.*

  test("基础 Show 类型类") {
    assert(show(42) == "Int(42)")
    assert(show("hi") == "Str(\"hi\")")
    assert(show(true) == "Bool(true)")
  }

  test("上下文绑定") {
    assert(showCtx(3) == "Int(3)")
  }

  test("自定义类型实例") {
    val u = User("ada", 36)
    assert(show(u) == "User(ada, 36)")
  }

  test("派生 tuple2 Show") {
    val s = show((1, "x"))
    assert(s == "(Int(1), Str(\"x\"))")
  }

  test("summon 取出实例") {
    val ev: Show[Int] = summon[Show[Int]]
    assert(ev.show(5) == "Int(5)")
  }

  test("selective import given") {
    import TypeClasses.Selective.given
    // 局部 selective 实例优先
    assert(show(7) == "Int ordered = 7")
  }
}
