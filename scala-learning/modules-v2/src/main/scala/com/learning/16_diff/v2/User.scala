package com.learning.`16_diff`.v2

import scala.annotation.implicitNotFound

/**
 * 题目：定义 JSON 值、Show 类型类、Monoid 类型类,以及一个把任意 Showable 转换为 JSON 的函数。
 *
 * Scala 2 风格:
 *   - implicit val / implicit class
 *   - implicit def 作隐式转换
 *   - package object 持有共享别名
 */
object User {

  // ---- ADT ----
  sealed trait Json
  case object JNull                extends Json
  case class  JBool(b: Boolean)    extends Json
  case class  JNum(n: BigDecimal)  extends Json
  case class  JStr(s: String)      extends Json
  case class  JArr(xs: List[Json]) extends Json
  case class  JObj(kv: Map[String, Json]) extends Json

  // ---- Type class ----
  @implicitNotFound("Cannot find Show[${A}]")
  trait Show[A] { def show(a: A): String }

  // ---- Monoid ----
  trait Monoid[A] {
    def empty: A
    def combine(x: A, y: A): A
  }

  // ---- 隐式实例 ----
  implicit val showInt: Show[Int]       = (a: Int)       => a.toString
  implicit val showString: Show[String] = (a: String)    => "\"" + a + "\""
  implicit val showBoolean: Show[Boolean] = (a: Boolean) => a.toString
  implicit val showJson: Show[Json]     = (j: Json) => j match {
    case JNull            => "null"
    case JBool(b)         => b.toString
    case JNum(n)          => n.toString
    case JStr(s)          => "\"" + s + "\""
    case JArr(xs)         => xs.map(implicitly[Show[Json]].show).mkString("[", ",", "]")
    case JObj(kv)         => kv.map { case (k, v) => "\"" + k + "\":" + implicitly[Show[Json]].show(v) }.mkString("{", ",", "}")
  }

  // List 的 Monoid
  implicit def listMonoid[A]: Monoid[List[A]] = new Monoid[List[A]] {
    def empty: List[A] = Nil
    def combine(x: List[A], y: List[A]): List[A] = x ++ y
  }

  implicit val intMonoid: Monoid[Int] = new Monoid[Int] {
    def empty: Int = 0
    def combine(x: Int, y: Int): Int = x + y
  }

  // ---- 泛型接口 ----
  def toJsonList[A: Show](xs: List[A]): Json = JArr(xs.map(a => JStr(implicitly[Show[A]].show(a))))
  def combineAll[A: Monoid](xs: List[A]): A = xs.foldLeft(implicitly[Monoid[A]].empty)(implicitly[Monoid[A]].combine)
}
