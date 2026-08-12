package com.learning.`00_expressiveness`.v3

import scala.annotation.implicitNotFound

/**
 * M00 —— Scala 表达力之旅(Scala 3 版)。
 *
 * 同样的 6 个例子,展示 Scala 3 相对 Scala 2 的语法改进:
 *   - `enum` 比 sealed trait + case object 简洁
 *   - `given` / `using` 比 `implicit` 显式
 *   - `extension` 比 `implicit class` 直接
 *   - `if cond then` 取代 `if (cond)`
 *   - 缺 case 直接编译错误
 */
object Expressiveness:

  // -------------------------------------------------------------------------
  // 例子 1:enum
  // -------------------------------------------------------------------------
  enum Status:
    case Ok
    case NotFound
    case Unknown(code: Int)

  def getStatus(code: Int): Status = code match
    case 200    => Status.Ok
    case 404    => Status.NotFound
    case n      => Status.Unknown(n)

  // -------------------------------------------------------------------------
  // 例子 2:Option
  // -------------------------------------------------------------------------
  final case class User(email: Option[String])

  def findUserEmail(u: User): String =
    u.email.getOrElse("anonymous")

  // -------------------------------------------------------------------------
  // 例子 3:match
  // -------------------------------------------------------------------------
  enum Shape:
    case Circle(r: Double)
    case Rectangle(w: Double, h: Double)

  def area(s: Shape): Double = s match
    case Shape.Circle(r)       => math.Pi * r * r
    case Shape.Rectangle(w, h) => w * h

  // -------------------------------------------------------------------------
  // 例子 4:extension
  // -------------------------------------------------------------------------
  extension (s: String)
    def toSnake: String = s.replaceAll("([A-Z])", "_$1").toLowerCase

  // -------------------------------------------------------------------------
  // 例子 5:类型类
  // -------------------------------------------------------------------------
  @implicitNotFound("No Show[${A}]")
  trait Show[A]:
    def show(a: A): String

  object Show:
    given showInt: Show[Int]    = _.toString
    given showStr: Show[String] = s => s"\"$s\""

  def show[A](a: A)(using ev: Show[A]): String = ev.show(a)

  // -------------------------------------------------------------------------
  // 例子 6:for 在 Option
  // -------------------------------------------------------------------------
  def tryDivide(a: Int, b: Int): Option[Int] =
    if b == 0 then None else Some(a / b)

  def workflow(a: Int, b: Int, c: Int): Option[Int] =
    for
      x <- tryDivide(a, b)
      y <- tryDivide(x, c)
    yield y

  // -------------------------------------------------------------------------
  // 端到端:demo
  // -------------------------------------------------------------------------
  def run(): Unit =
    assert(getStatus(200) == Status.Ok)
    assert(getStatus(404) == Status.NotFound)
    assert(getStatus(500) == Status.Unknown(500))

    assert(findUserEmail(User(Some("ada@x"))) == "ada@x")
    assert(findUserEmail(User(None)) == "anonymous")

    assert(area(Shape.Circle(1.0)) > 3.14 && area(Shape.Circle(1.0)) < 3.15)
    assert(area(Shape.Rectangle(2, 3)) == 6.0)

    assert("UserName".toSnake == "_user_name")

    assert(show(42) == "42")
    assert(show("hi") == "\"hi\"")

    assert(workflow(100, 5, 2) == Some(10))
    assert(workflow(100, 0, 2).isEmpty)

    println("M00 Expressiveness (Scala 3) demo passed.")
