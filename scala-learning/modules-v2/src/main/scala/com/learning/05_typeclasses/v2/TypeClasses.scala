package com.learning.`05_typeclasses`.v2

/**
 * Scala 2 类型类（Type Class Pattern）：
 *   - 一个 trait（类型类）声明操作
 *   - 一组隐式值（instances）为已知类型提供实现
 *   - 一组泛型方法（interface）通过隐式参数调用实例
 *
 * 隐式解析三步：
 *   1. 局部作用域
 *   2. 隐式作用域（companion object / implicit scope）
 *   3. 显式 import
 */
object TypeClasses {

  // ---- 1) 类型类定义 ----
  trait Show[A] {
    def show(a: A): String
  }

  // ---- 2) 隐式实例 ----
  implicit val intShow: Show[Int]       = (a: Int) => s"Int($a)"
  implicit val stringShow: Show[String] = (a: String) => s"Str(\"$a\")"
  implicit val booleanShow: Show[Boolean] = (a: Boolean) => s"Bool($a)"

  // 用户自定义类型的实例——放在 companion 上即可自动进入隐式作用域
  final case class User(name: String, age: Int)
  object User {
    implicit val userShow: Show[User] = u => s"User(${u.name}, ${u.age})"
  }

  // ---- 3) 通用接口 ----
  def show[A](a: A)(implicit ev: Show[A]): String = ev.show(a)
  def showCtx[A: Show](a: A): String             = show(a)

  // ---- 4) 类型类派生（ad-hoc derivation） ----
  // 元组类型类的派生
  implicit def tuple2Show[A: Show, B: Show]: Show[(A, B)] =
    t => s"(${showCtx(t._1)}, ${showCtx(t._2)})"

  // ---- 5) implicit conversions（慎用）----
  // 隐式转换会自动把一种类型转成另一种,触发隐式作用域解析
  implicit class ShowOps[A](val a: A) extends AnyVal {
    def print(implicit ev: Show[A]): String = ev.show(a)
  }
}
