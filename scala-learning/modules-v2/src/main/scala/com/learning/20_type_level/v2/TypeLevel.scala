package com.learning.`20_type_level`.v2

/**
 * M20 —— 类型级编程(Scala 2 版)。
 *
 * 关键演示:
 *   - Peano 数(类型级自然数)
 *   - 路径依赖类型
 *   - 类型 lambda
 *   - HList
 *   - 类型约束
 */
object TypeLevel {

  // -------------------------------------------------------------------------
  // 1) Peano 数
  // -------------------------------------------------------------------------
  sealed trait Nat
  case object Zero                     extends Nat
  case class  Succ[N <: Nat](n: N)    extends Nat

  type _0 = Zero.type
  type _1 = Succ[_0]
  type _2 = Succ[_1]
  type _3 = Succ[_2]

  // -------------------------------------------------------------------------
  // 2) 路径依赖类型
  // -------------------------------------------------------------------------
  class Database {
    class Row
    val empty: Row = new Row
    def create: Row = new Row
  }

  // -------------------------------------------------------------------------
  // 3) 类型 lambda
  // -------------------------------------------------------------------------
  type Compose[F[_], G[_]] = { type L[A] = F[G[A]] }

  // -------------------------------------------------------------------------
  // 4) HList
  // -------------------------------------------------------------------------
  sealed trait HList
  case object HNil                              extends HList
  case class  ::[+H, +T <: HList](head: H, tail: T) extends HList

  // -------------------------------------------------------------------------
  // 5) 依赖方法类型
  // -------------------------------------------------------------------------
  trait Length {
    type N
    def value: N
  }
  class Len1 extends Length { type N = Int;    def value = 7 }
  class Len2 extends Length { type N = String; def value = "seven" }

  // -------------------------------------------------------------------------
  // 6) 端到端 demo
  // -------------------------------------------------------------------------
  def run(): Unit = {
    // 1) Peano
    val three: _3 = Succ(Succ(Succ(Zero)))
    val t2: _2 = Succ(Succ(Zero))
    val _: _2 = t2

    // 2) 路径依赖
    val db1 = new Database
    val db2 = new Database
    val r1: db1.Row = db1.empty
    val r2: db2.Row = db2.empty
    assert(r1.isInstanceOf[db1.Row])
    assert(r2.isInstanceOf[db2.Row])

    // 3) 类型 lambda
    type ComposedListOption[T] = Compose[List, Option]#L[T]
    val xs: ComposedListOption[Int] = List(Some(1), None, Some(2))
    val ys = xs.map {
      case Some(n) => Some(n.toString)
      case None    => None
    }
    assert(ys == List(Some("1"), None, Some("2")))

    // 4) HList
    val hl: Int :: String :: Boolean :: HNil.type =
      ::(1, ::("hi", ::(true, HNil)))
    assert(hl.head == 1)
    assert(hl.tail.head == "hi")
    assert(hl.tail.tail.head == true)
    assert(hl.tail.tail.tail == HNil)

    // 5) 依赖方法类型
    val l1 = new Len1
    val l2 = new Len2
    val v1: Int    = l1.value
    val v2: String = l2.value
    assert(v1 == 7)
    assert(v2 == "seven")

    println("M20 Type Level (Scala 2) demo passed.")
  }
}
