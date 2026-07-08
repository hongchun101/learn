package com.learning.`14_macros_meta`.v2

import org.scalatest.funsuite.AnyFunSuite

class MacroLandmarksSpec extends AnyFunSuite {
  import MacroLandmarks._

  test("@BeanProperty 生成 getter/setter") {
    val u = new UserAccount
    u.setBalance(100.0)
    assert(u.getBalance == 100.0)
  }

  test("@nowarn 不抛错") {
    silence()
  }

  test("@implicitNotFound 注解存在即可") {
    // 仅验证 trait 存在
    val ord: Ord[Int] = (a, b) => a - b
    assert(ord.compare(3, 2) > 0)
  }

  test("quasiquote 演示字符串") {
    assert(quasiquoteSketch().contains("sketch"))
  }
}
