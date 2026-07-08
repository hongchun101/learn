package com.learning.`08_hof_sam`.v2

import org.scalatest.funsuite.AnyFunSuite

class HofsSpec extends AnyFunSuite {
  import Hofs._

  test("函数复合 compose") {
    val f: Int => Int    = _ + 1
    val g: Int => String = _.toString
    val h                = compose(g, f)
    assert(h(41) == "42")
  }

  test("foldLeft 求和") {
    assert(foldLeft(List(1, 2, 3, 4))(0)(_ + _) == 10)
  }

  test("SAM trait 自动转换") {
    val t: Transformer[Int, String] = intToStr
    assert(t.transform(7) == "value=7")
  }

  test("偏应用") {
    assert(add5(3) == 8)
    assert(plus5(3) == 8)
  }

  test("闭包计数器") {
    val c = makeCounter()
    assert(c() == 1)
    assert(c() == 2)
    assert(c() == 3)
  }
}
