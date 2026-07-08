package com.learning.`16_diff`.v2

import org.scalatest.funsuite.AnyFunSuite

class UserSpec extends AnyFunSuite {
  import User._

  test("Show[Json] 渲染嵌套对象") {
    val json: Json = JObj(Map("name" -> JStr("ada"), "age" -> JNum(BigDecimal(36))))
    assert(showJson.show(json) == """{"name":"ada","age":36}""")
  }

  test("Monoid[Int] 求和") {
    assert(combineAll(List(1, 2, 3, 4, 5)) == 15)
  }

  test("Monoid[List[String]] 拼接") {
    assert(combineAll(List(List("a"), List("b"), List("c"))) == List("a", "b", "c"))
  }

  test("toJsonList") {
    val j = toJsonList(List(1, 2, 3))
    assert(showJson.show(j) == """["1","2","3"]""")
  }
}
