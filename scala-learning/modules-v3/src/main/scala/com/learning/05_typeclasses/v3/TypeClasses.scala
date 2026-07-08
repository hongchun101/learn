package com.learning.`05_typeclasses`.v3

/**
 * Scala 3 类型类：用 `given` 代替 `implicit`,`using` 代替隐式参数列表,
 * `summon` 代替 `implicitly`,`given A = ...` 代替 `implicit val`。
 *
 * 关键改进：
 *   - `given` 是独立的定义,没有值/val/def 之分,语法更清晰
 *   - `using` 把隐式参数在调用点显式可见
 *   - `given Conversion[A, B]` 替代 `implicit def`,作用域更明确
 *   - `summon[Show[A]]` 在错误信息上更友好
 */
object TypeClasses:

  // 1) 类型类
  trait Show[A]:
    def show(a: A): String

  // 2) 实例
  given intShow: Show[Int]       = (a: Int) => s"Int($a)"
  given stringShow: Show[String] = (a: String) => s"Str(\"$a\")"
  given booleanShow: Show[Boolean] = (a: Boolean) => s"Bool($a)"

  final case class User(name: String, age: Int)
  object User:
    given userShow: Show[User] = u => s"User(${u.name}, ${u.age})"

  // 3) 通用接口
  def show[A](a: A)(using ev: Show[A]): String = ev.show(a)
  def showCtx[A: Show](a: A): String           = show(a)

  // 4) 类型类派生：使用 using 链
  given tuple2Show[A: Show, B: Show] as Show[(A, B)] =
    t => s"(${showCtx(t._1)}, ${showCtx(t._2)})"

  // 5) summon —— 取出隐式值,等价于 Scala 2 的 implicitly
  inline def summonShow[A](using ev: Show[A]): String = ev.show(summon[Show[A]].show(???))

  // 6) 显式给定名解析:given Foo: Show[Int] = ...
  // 通过 import given 选择性引入
  object Selective:
    given ordered: Show[Int] = (a: Int) => s"Int ordered = $a"
