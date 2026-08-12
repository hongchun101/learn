package com.learning.`20_type_level`.v2

import org.scalatest.funsuite.AnyFunSuite

class TypeLevelSpec extends AnyFunSuite {
  import TypeLevel._

  test("Peano 数") {
    val three: _3 = Succ(Succ(Succ(Zero)))
    val t2: _2 = Succ(Succ(Zero))
    val _: _2 = t2
    assert(true)
  }

  test("路径依赖") {
    val db1 = new Database
    val db2 = new Database
    val r1: db1.Row = db1.empty
    val r2: db2.Row = db2.empty
    assert(r1.isInstanceOf[db1.Row])
    assert(r2.isInstanceOf[db2.Row])
  }

  test("类型 lambda") {
    type ComposedListOption[T] = Compose[List, Option]#L[T]
    val xs: ComposedListOption[Int] = List(Some(1), None, Some(2))
    val ys = xs.map {
      case Some(n) => Some(n.toString)
      case None    => None
    }
    assert(ys == List(Some("1"), None, Some("2")))
  }

  test("HList") {
    val hl: Int :: String :: Boolean :: HNil.type =
      ::(1, ::("hi", ::(true, HNil)))
    assert(hl.head == 1)
    assert(hl.tail.head == "hi")
    assert(hl.tail.tail.head == true)
    assert(hl.tail.tail.tail == HNil)
  }

  test("依赖方法类型") {
    val l1 = new Len1
    val l2 = new Len2
    val v1: Int    = l1.value
    val v2: String = l2.value
    assert(v1 == 7)
    assert(v2 == "seven")
  }

  test("end-to-end demo") {
    run()
  }
}
