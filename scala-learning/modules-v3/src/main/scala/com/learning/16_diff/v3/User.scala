package com.learning.`16_diff`.v3

import scala.annotation.implicitNotFound

/**
 * 同一题目:Scala 3 风格
 *
 *   - enum 直接表达 JSON
 *   - given / using
 *   - summon 代替 implicitly
 *   - extension 增强 List
 */
object User:

  // ---- ADT ----
  enum Json:
    case JNull
    case JBool(b: Boolean)
    case JNum(n: BigDecimal)
    case JStr(s: String)
    case JArr(xs: List[Json])
    case JObj(kv: Map[String, Json])

  // ---- Type class ----
  @implicitNotFound("Cannot find Show[${A}]")
  trait Show[A]:
    def show(a: A): String

  // ---- Monoid ----
  trait Monoid[A]:
    def empty: A
    def combine(x: A, y: A): A

  // ---- 隐式实例 ----
  given showInt: Show[Int]       = (a: Int)       => a.toString
  given showString: Show[String] = (a: String)    => "\"" + a + "\""
  given showBoolean: Show[Boolean] = (a: Boolean) => a.toString
  given showJson: Show[Json] = (j: Json) => j match
    case Json.JNull        => "null"
    case Json.JBool(b)     => b.toString
    case Json.JNum(n)      => n.toString
    case Json.JStr(s)      => "\"" + s + "\""
    case Json.JArr(xs)     => xs.map(summon[Show[Json]].show).mkString("[", ",", "]")
    case Json.JObj(kv)     => kv.map { case (k, v) => "\"" + k + "\":" + summon[Show[Json]].show(v) }.mkString("{", ",", "}")

  // List 的 Monoid
  given listMonoid[A]: Monoid[List[A]] with
    def empty: List[A] = Nil
    def combine(x: List[A], y: List[A]): List[A] = x ++ y

  given intMonoid: Monoid[Int] with
    def empty: Int = 0
    def combine(x: Int, y: Int): Int = x + y

  // ---- 泛型接口 ----
  def toJsonList[A: Show](xs: List[A]): Json = Json.JArr(xs.map(a => Json.JStr(summon[Show[A]].show(a))))
  def combineAll[A: Monoid](xs: List[A]): A = xs.foldLeft(summon[Monoid[A]].empty)(summon[Monoid[A]].combine)

  // 顶级 extension:取代 implicit class
  extension [A: Show](xs: List[A])
    def renderJsonArray: String =
      summon[Show[Json]].show(toJsonList(xs))
