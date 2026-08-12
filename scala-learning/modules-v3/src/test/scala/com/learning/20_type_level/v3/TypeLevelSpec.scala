package com.learning.`20_type_level`.v3

import org.scalatest.funsuite.AnyFunSuite

class TypeLevelSpec extends AnyFunSuite {
  import TypeLevel.*

  test("Peano 数") {
    val three: Succ[Succ[Succ[Nat.Zero.type]]] = Succ(Succ(Succ(Nat.Zero)))
    val t2: Succ[Succ[Nat.Zero.type]] = Succ(Succ(Nat.Zero))
    assert(true)
  }

  test("match types") {
    val xs: List[Option[Int]] = List(Some(1), None, Some(2))
    val ys: List[Option[String]] = xs.map {
      case Some(n) => Some(n.toString)
      case None    => None
    }
    assert(ys == List(Some("1"), None, Some("2")))
  }

  test("原生类型 lambda") {
    type ComposedListOption[T] = Compose[List, Option][T]
    val xs: ComposedListOption[Int] = List(Some(1), None, Some(2))
    val ys = xs.map {
      case Some(n) => Some(n.toString)
      case None    => None
    }
    assert(ys == List(Some("1"), None, Some("2")))
  }

  test("路径依赖") {
    val db1 = Database()
    val db2 = Database()
    val r1: db1.Row = db1.empty
    val r2: db2.Row = db2.empty
    assert(r1.isInstanceOf[db1.Row])
    assert(r2.isInstanceOf[db2.Row])
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
    val l1 = Len1()
    val l2 = Len2()
    val v1: Int    = l1.value
    val v2: String = l2.value
    assert(v1 == 7)
    assert(v2 == "seven")
  }

  test("end-to-end demo") {
    run()
  }
}
