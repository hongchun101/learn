package com.learning.`05_typeclasses`.v2

import org.scalatest.funsuite.AnyFunSuite

class TypeClassesSpec extends AnyFunSuite {
  import TypeClasses._

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

  test("扩展方法 print") {
    import ShowOps // 引入扩展方法
    assert(42.print == "Int(42)")
  }
}
