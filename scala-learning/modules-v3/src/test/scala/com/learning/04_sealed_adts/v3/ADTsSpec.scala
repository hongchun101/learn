package com.learning.`04_sealed_adts`.v3

import org.scalatest.funsuite.AnyFunSuite

class ADTsSpec extends AnyFunSuite {
  import ADTs.*

  test("Json ADT 渲染") {
    val j: Json = JsonObj(Map(
      "name" -> JsonStr("ada"),
      "age"  -> JsonNum(BigDecimal(36)),
      "tags" -> JsonArr(List(JsonStr("scala"), JsonStr("fp"))),
      "admin" -> JsonBool(false),
      "x"     -> JsonNull
    ))
    val s = Json.render(j)
    assert(s.contains("\"name\":\"ada\""))
    assert(s.contains("\"age\":36"))
    assert(s.contains("\"tags\":[\"scala\",\"fp\"]"))
    assert(s.contains("\"admin\":false"))
    assert(s.contains("\"x\":null"))
  }

  test("二叉树 size + inOrder") {
    val t: Tree[Int] = Tree.Branch(Tree.Branch(Tree.Leaf(1), Tree.Leaf(2)), Tree.Leaf(3))
    assert(Tree.size(t) == 3)
    assert(Tree.inOrder(t) == List(1, 2, 3))
  }

  test("简单 enum Color") {
    val all = Seq(Color.Red, Color.Green, Color.Blue)
    assert(all.map(_.toString) == Seq("Red", "Green", "Blue"))
  }

  test("带参数 enum Planet") {
    val g = Planet.Earth.surfaceGravity
    assert(g > 9.0 && g < 10.0) // 地球表面重力 ~9.8
  }
}
