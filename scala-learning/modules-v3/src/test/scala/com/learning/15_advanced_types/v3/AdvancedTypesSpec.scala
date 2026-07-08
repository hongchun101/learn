package com.learning.`15_advanced_types`.v3

import org.scalatest.funsuite.AnyFunSuite

class AdvancedTypesSpec extends AnyFunSuite {
  import AdvancedTypes.*

  test("路径依赖") {
    val db1 = Database()
    val db2 = Database()
    val r1: db1.Row = db1.empty
    val r2: db2.Row = db2.empty
    assert(r1.isInstanceOf[db1.Row])
    assert(r2.isInstanceOf[db2.Row])
  }

  test("依赖方法类型") {
    val l1 = Len1()
    val l2 = Len2()
    val v1: Int    = l1.value
    val v2: String = l2.value
    assert(v1 == 7)
    assert(v2 == "seven")
  }

  test("类型 lambda 一等公民 + Compose") {
    type F[T] = List[Option[T]]
    def fa: F[Int] = List(Some(1), None, Some(2))
    val mapped: F[String] = fa.map {
      case Some(n) => Some(n.toString)
      case None    => None
    }
    assert(mapped == List(Some("1"), None, Some("2")))
  }
}
