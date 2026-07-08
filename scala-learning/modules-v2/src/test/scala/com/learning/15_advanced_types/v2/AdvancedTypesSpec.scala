package com.learning.`15_advanced_types`.v2

import org.scalatest.funsuite.AnyFunSuite

class AdvancedTypesSpec extends AnyFunSuite {
  import AdvancedTypes._

  test("路径依赖:不同 Database 的 Row 互不兼容") {
    val db1 = new Database
    val db2 = new Database
    val r1: db1.Row = db1.empty
    val r2: db2.Row = db2.empty
    assert(r1.isInstanceOf[db1.Row])
    assert(r2.isInstanceOf[db2.Row])
  }

  test("依赖方法类型:返回类型随实例变") {
    val l1 = new Len1
    val l2 = new Len2
    val v1: Int    = l1.value
    val v2: String = l2.value
    assert(v1 == 7)
    assert(v2 == "seven")
  }

  test("类型 lambda Compose 构造 + 路径依赖") {
    // 通过类型 lambda 组合 List / Option 两个 HKT
    type ComposedListOption[T] = Compose[List, Option, T]
    val xs: ComposedListOption[Int] = List(Some(1), None, Some(2))
    val ys: ComposedListOption[String] = xs.map {
      case Some(n) => Some(n.toString)
      case None    => None
    }
    assert(ys == List(Some("1"), None, Some("2")))
  }
}
