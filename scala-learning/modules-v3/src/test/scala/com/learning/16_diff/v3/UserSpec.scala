package com.learning.`16_diff`.v3

import org.scalatest.funsuite.AnyFunSuite

class UserSpec extends AnyFunSuite {
  import User.*
  import User.given

  test("Show[Json] 渲染嵌套对象") {
    val json: Json = Json.JObj(Map("name" -> Json.JStr("ada"), "age" -> Json.JNum(BigDecimal(36))))
    assert(summon[Show[Json]].show(json) == """{"name":"ada","age":36}""")
  }

  test("Monoid[Int] 求和") {
    assert(combineAll(List(1, 2, 3, 4, 5)) == 15)
  }

  test("Monoid[List[String]] 拼接") {
    assert(combineAll(List(List("a"), List("b"), List("c"))) == List("a", "b", "c"))
  }

  test("toJsonList + extension renderJsonArray") {
    val j = toJsonList(List(1, 2, 3))
    assert(summon[Show[Json]].show(j) == """["1","2","3"]""")
    assert(List("a", "b").renderJsonArray == """["a","b"]""")
  }
}
