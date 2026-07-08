package com.learning.`03_classes_traits`.v2

import org.scalatest.funsuite.AnyFunSuite

class ClassSystemSpec extends AnyFunSuite {
  import ClassSystem._

  test("抽象类型成员 + 具体实现") {
    val c = new StringContainer
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

  test("特质线性化 —— 先 Timestamped 后 Audited") {
    val s = new Service
    // Service extends TimestampLogged with Audited
    // 线性化：Service → Audited → TimestampLogged → Logged → AnyRef → Any
    // log("started") 调用顺序：Audited.log → super → TimestampLogged.log → super → Logged.log
    s.run() // 简单观察无异常
  }

  test("包对象类型别名与默认隐式") {
    import com.learning.`03_classes_traits`.v2._
    val m: StringMap = Map("a" -> "1")
    assert(m("a") == "1")
    assert(Empty.isEmpty)
    // 默认隐式 String 仍可在作用域内被引用
    val s: String = defaultGreeting
    assert(s == "Hello")
  }
}
