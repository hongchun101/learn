package com.learning.`00_expressiveness`.v2

import scala.annotation.implicitNotFound

/**
 * M00 —— Scala 表达力之旅(Scala 2 版)。
 *
 * 6 个例子展示 Scala 的核心价值,每段代码都是"可编译 + 有断言" 的
 * 迷你演示,适合在 sbt console 中运行。
 */
object Expressiveness {

  // -------------------------------------------------------------------------
  // 例子 1:用 sealed trait 表达有限可能
  // -------------------------------------------------------------------------
  sealed trait Status
  case object Ok                  extends Status
  case object NotFound            extends Status
  case class  Unknown(code: Int)  extends Status

  def getStatus(code: Int): Status = code match {
    case 200 => Ok
    case 404 => NotFound
    case n   => Unknown(n)
  }

  // -------------------------------------------------------------------------
  // 例子 2:Option 代替 null
  // -------------------------------------------------------------------------
  final case class User(email: Option[String])

  def findUserEmail(u: User): String =
    u.email.getOrElse("anonymous")

  // -------------------------------------------------------------------------
  // 例子 3:模式匹配代替 instanceof
  // -------------------------------------------------------------------------
  sealed trait Shape
  case class Circle(r: Double)        extends Shape
  case class Rectangle(w: Double, h: Double) extends Shape

  def area(s: Shape): Double = s match {
    case Circle(r)      => math.Pi * r * r
    case Rectangle(w, h) => w * h
  }

  // -------------------------------------------------------------------------
  // 例子 4:扩展方法(implicit class)
  // -------------------------------------------------------------------------
  implicit class StringOps(val s: String) extends AnyVal {
    def toSnake: String = s.replaceAll("([A-Z])", "_$1").toLowerCase
  }

  // -------------------------------------------------------------------------
  // 例子 5:类型类
  // -------------------------------------------------------------------------
  @implicitNotFound("No Show[${A}]")
  trait Show[A] { def show(a: A): String }

  object Show {
    implicit val showInt: Show[Int]    = _.toString
    implicit val showStr: Show[String] = s => s"\"$s\""
  }

  def show[A](a: A)(implicit ev: Show[A]): String = ev.show(a)

  // -------------------------------------------------------------------------
  // 例子 6:for 推导在 Option 上
  // -------------------------------------------------------------------------
  def tryDivide(a: Int, b: Int): Option[Int] =
    if (b == 0) None else Some(a / b)

  def workflow(a: Int, b: Int, c: Int): Option[Int] =
    for {
      x <- tryDivide(a, b)
      y <- tryDivide(x, c)
    } yield y

  // -------------------------------------------------------------------------
  // 端到端:demo
  // -------------------------------------------------------------------------
  def run(): Unit = {
    // 1) sealed + match
    assert(getStatus(200) == Ok)
    assert(getStatus(404) == NotFound)
    assert(getStatus(500) == Unknown(500))

    // 2) Option 代替 null
    assert(findUserEmail(User(Some("ada@x"))) == "ada@x")
    assert(findUserEmail(User(None)) == "anonymous")

    // 3) match 代替 instanceof
    assert(area(Circle(1.0)) > 3.14 && area(Circle(1.0)) < 3.15)
    assert(area(Rectangle(2, 3)) == 6.0)

    // 4) 扩展方法
    assert("UserName".toSnake == "_user_name")

    // 5) 类型类
    assert(show(42) == "42")
    assert(show("hi") == "\"hi\"")

    // 6) for 在 Option
    assert(workflow(100, 5, 2) == Some(10))
    assert(workflow(100, 0, 2).isEmpty)

    println("M00 Expressiveness (Scala 2) demo passed.")
  }
}
