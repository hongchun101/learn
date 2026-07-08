package com.learning.`02_functions`.v3

/**
 * Scala 3 函数特性全景：
 *   - 默认参数、命名参数、变参（与 Scala 2 一致）
 *   - `using` 参数替代 `(implicit ...)` —— 显式而克制的"上下文参数"
 *   - 控制结构使用 end 标记的 if/while 块（可选,但能消除缩进歧义）
 *   - 过程语法 `def f(x: Int): Unit = ...` 成为唯一形式；旧的 `def f(x: Int) { ... }` 被移除
 *   - `?` 通配符模式与多行字符串 `|>` 风格更友好
 *   - 多参数列表 + `using` 组合,实现显式上下文
 *   - `@targetName` 解决跨语言/JSON 的命名映射
 */
object Functions:

  // 默认参数 + 命名参数
  def greet(name: String, greeting: String = "Hello", punctuation: String = "!"): String =
    s"$greeting, $name$punctuation"

  // 变参
  def sum(xs: Int*): Int = xs.sum

  // 柯里化
  def curriedAdd(x: Int)(y: Int): Int = x + y
  val add5: Int => Int = curriedAdd(5)

  // 按名参数
  def unless(condition: Boolean)(block: => Unit): Unit =
    if !condition then block

  // using 参数（替代 implicit 参数列表）
  def max[T](xs: List[T])(using ord: Ordering[T]): T = xs.max

  // end 标记的多行 if,让缩进歧义消失
  def describe(n: Int): String =
    if n < 0 then
      "negative"
    else if n == 0 then
      "zero"
    else
      "positive"
    end if

  // @targetName —— 编译产物层面的命名修正
  @targetName("jsonOf")
  def toJson(s: String): String = s"\"$s\""

  // 控制抽象
  def when[A](cond: Boolean)(body: => A): Option[A] =
    if cond then Some(body) else None
