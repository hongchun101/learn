package com.learning.`04_sealed_adts`.v2

import org.scalatest.funsuite.AnyFunSuite

class ADTsSpec extends AnyFunSuite {
  import ADTs._

  test("Json ADT 渲染") {
    val j: Json = JsonObj(Map(
      "name" -> JsonStr("ada"),
      "age"  -> JsonNum(BigDecimal(36)),
      "tags" -> JsonArr(List(JsonStr("scala"), JsonStr("fp"))),
      "admin" -> JsonBool(false),
      "x"     -> JsonNull
    ))
    val s = render(j)
    assert(s.contains("\"name\":\"ada\""))
    assert(s.contains("\"age\":36"))
    assert(s.contains("\"tags\":[\"scala\",\"fp\"]"))
    assert(s.contains("\"admin\":false"))
    assert(s.contains("\"x\":null"))
  }

  test("二叉树 size") {
    val t: Tree[Int] = Branch(Branch(Leaf(1), Leaf(2)), Leaf(3))
    assert(size(t) == 3)
  }

  test("Scala 2 枚举") {
    import Color._
    val all = Seq(Red, Green, Blue)
    assert(all.map(_.toString) == Seq("Red", "Green", "Blue"))
  }
}
