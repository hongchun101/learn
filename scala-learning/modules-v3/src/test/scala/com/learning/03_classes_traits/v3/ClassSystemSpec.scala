package com.learning.`03_classes_traits`.v3

import org.scalatest.funsuite.AnyFunSuite

class ClassSystemSpec extends AnyFunSuite {
  import ClassSystem.*

  test("抽象类型成员 + 具体实现") {
    val c = StringContainer()
    c.add("hello")
    c.add("world")
    assert(c.get(0) == "hello")
    assert(c.get(1) == "world")
  }

  test("自身类型约束") {
    val sp: StringContainer with Persistable = new StringContainer with Persistable
    sp.add("k")
    assert(sp.save().contains("k"))
  }

  test("特质线性化与 open 类") {
    val s = Service()
    s.run()
  }

  test("顶级定义 + export 替代包对象") {
    // 来自 `export com.learning.03_classes_traits.v3.types.*`
    import com.learning.`03_classes_traits`.v3.types.*
    val m: StringMap = Map("a" -> "1")
    assert(m("a") == "1")
    assert(Empty.isEmpty)
    assert(defaultGreeting == "Hello")
  }
}
