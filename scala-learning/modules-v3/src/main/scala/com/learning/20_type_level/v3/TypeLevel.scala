package com.learning.`20_type_level`.v3

/**
 * M20 —— 类型级编程(Scala 3 版)。
 *
 * Scala 3 优势:
 *   - match types:把"模式匹配"搬到类型层
 *   - 原生类型 lambda:[A] =>> F[G[A]]
 *   - inline + compiletime.* 系列 API
 */
object TypeLevel:

  // -------------------------------------------------------------------------
  // 1) Peano 数
  // -------------------------------------------------------------------------
  enum Nat:
    case Zero
    case Succ(n: Nat)

  type _0 = Nat.Zero.type
  type _1 = Succ[_0]
  type _2 = Succ[_1]

  // -------------------------------------------------------------------------
  // 2) match types(Scala 3)
  // -------------------------------------------------------------------------
  type Elem[X] = X match
    case List[a]   => a
    case Vector[a] => a
    case Option[a] => a
    case _         => X

  type T1 = Elem[List[Int]]      // Int
  type T2 = Elem[Vector[String]] // String
  type T3 = Elem[Int]            // Int(兜底)

  // -------------------------------------------------------------------------
  // 3) 原生类型 lambda
  // -------------------------------------------------------------------------
  type Compose[F[_], G[_]] = [A] =>> F[G[A]]

  // -------------------------------------------------------------------------
  // 4) 路径依赖
  // -------------------------------------------------------------------------
  class Database:
    class Row
    val empty: Row = new Row
    def create: Row = new Row

  // -------------------------------------------------------------------------
  // 5) HList
  // -------------------------------------------------------------------------
  enum HList:
    case HNil
    case ::[+H, +T <: HList](head: H, tail: T)

  // -------------------------------------------------------------------------
  // 6) 依赖方法类型
  // -------------------------------------------------------------------------
  trait Length:
    type N
    def value: N

  class Len1 extends Length:
    type N = Int
    def value = 7

  class Len2 extends Length:
    type N = String
    def value = "seven"

  // -------------------------------------------------------------------------
  // 7) 端到端
  // -------------------------------------------------------------------------
  def run(): Unit =
    // 1) Peano
    val three: Succ[Succ[Succ[Nat.Zero.type]]] = Succ(Succ(Succ(Nat.Zero)))
    val t2: Succ[Succ[Nat.Zero.type]] = Succ(Succ(Nat.Zero))
    val _: Succ[Succ[Nat.Zero.type]] = t2

    // 2) match types(运行期验证)
    val xs: List[Option[Int]] = List(Some(1), None, Some(2))
    val ys: List[Option[String]] = xs.map {
      case Some(n) => Some(n.toString)
      case None    => None
    }
    assert(ys == List(Some("1"), None, Some("2")))

    // 3) 原生类型 lambda
    type ComposedListOption[T] = Compose[List, Option][T]
    val xs2: ComposedListOption[Int] = List(Some(1), None, Some(2))
    val ys2 = xs2.map {
      case Some(n) => Some(n.toString)
      case None    => None
    }
    assert(ys2 == List(Some("1"), None, Some("2")))

    // 4) 路径依赖
    val db1 = Database()
    val db2 = Database()
    val r1: db1.Row = db1.empty
    val r2: db2.Row = db2.empty
    assert(r1.isInstanceOf[db1.Row])
    assert(r2.isInstanceOf[db2.Row])

    // 5) HList
    val hl: Int :: String :: Boolean :: HNil.type =
      ::(1, ::("hi", ::(true, HNil)))
    assert(hl.head == 1)
    assert(hl.tail.head == "hi")
    assert(hl.tail.tail.head == true)
    assert(hl.tail.tail.tail == HNil)

    // 6) 依赖方法类型
    val l1 = Len1()
    val l2 = Len2()
    val v1: Int    = l1.value
    val v2: String = l2.value
    assert(v1 == 7)
    assert(v2 == "seven")

    println("M20 Type Level (Scala 3) demo passed.")
