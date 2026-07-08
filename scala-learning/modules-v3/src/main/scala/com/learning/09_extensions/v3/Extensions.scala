package com.learning.`09_extensions`.v3

/**
 * Scala 3 扩展方法：使用顶级 `extension` 关键字(无需 implicit class)。
 *
 * 关键优势:
 *   - 不需要 AnyVal 包装,编译器自动优化
 *   - 多个参数 / 类型参数 / 上下文参数都可直接写
 *   - 避免 implicit class 的常见陷阱(单参限制)
 *   - 顶级定义,无需包对象
 */

// 单参数扩展
extension (self: Int)
  def times(f: Int => Unit): Unit =
    var i = 0
    while i < self do
      f(i)
      i += 1

// 多参数扩展
extension (s: String)
  def toSnake: String       = s.replaceAll("([A-Z])", "_$1").toLowerCase
  def words: List[String]   = s.split("\\s+").toList
  def takeRight(n: Int): String = if n >= s.length then s else s.substring(s.length - n)

// 泛型扩展
extension [A](xs: List[A])
  def second: Option[A]       = xs.drop(1).headOption
  def secondOr[B >: A](default: B): B = xs.drop(1).headOption.getOrElse(default)

// 扩展方法 + 上下文参数
extension [A](xs: List[A])(using ord: Ordering[A])
  def isSorted: Boolean = xs.sliding(2).forall { case List(a, b) => ord.compare(a, b) <= 0; case _ => true }

// 集合扩展
extension [A](xs: List[A])
  def groupRuns[B >: A](by: B => Boolean): List[List[B]] = xs.foldLeft(List.empty[List[B]]) {
    case (acc, head) if acc.isEmpty || by(acc.head.head) != by(head) =>
      head :: acc.head :: acc.tail
    case (acc, head) =>
      (head :: acc.head) :: acc.tail
  }
