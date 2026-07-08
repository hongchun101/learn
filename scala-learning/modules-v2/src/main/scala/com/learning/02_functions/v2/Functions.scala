package com.learning.`02_functions`.v2

/**
 * Scala 2 函数特性全景：
 *   - 默认参数、命名参数、变参
 *   - 柯里化（currying）与偏应用
 *   - 按名参数 (=> A) 与按值参数的区别
 *   - 过程语法 `def f(x: Int) { ... }`（返回 Unit,但不推荐）
 *   - 多参数列表：常用于 DSL 与类型推断
 *   - 依赖方法类型（dependant method type）
 */
object Functions {

  // 默认参数 + 命名参数
  def greet(name: String, greeting: String = "Hello", punctuation: String = "!"): String =
    s"$greeting, $name$punctuation"

  // 变参 (varargs)
  def sum(xs: Int*): Int = xs.sum

  // 柯里化函数
  def curriedAdd(x: Int)(y: Int): Int = x + y

  // 偏应用 —— 固定第一参数
  val add5: Int => Int = curriedAdd(5)

  // 按名参数 —— 表达式作为 thunk 延迟求值
  def unless(condition: Boolean)(block: => Unit): Unit =
    if (!condition) block

  // 依赖方法类型：返回类型依赖参数值
  def zeroOf[T](t: T)(implicit ev: reflect.ClassTag[T]): Array[T] =
    Array.empty[T]

  // 多参数列表常用于：第一组参数决定第二组的隐式解析
  def max[T](xs: List[T])(implicit ord: Ordering[T]): T =
    xs.max

  // 过程语法（不推荐,仅作演示）
  def logSideEffect(msg: String): Unit = {
    // 注意：没有 `=` 时,即使写 `return`,也会以 Unit 返回
    println(s"[log] $msg")
  }

  // 返回 Unit 的显式形式
  def logExplicit(msg: String): Unit = println(s"[log] $msg")

  // 内联控制抽象：实现一个迷你 when
  def when[A](cond: Boolean)(body: => A): Option[A] =
    if (cond) Some(body) else None
}
