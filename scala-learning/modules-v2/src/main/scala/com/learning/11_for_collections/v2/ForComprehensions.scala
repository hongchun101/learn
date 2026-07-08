package com.learning.`11_for_collections`.v2

/**
 * Scala 2 for 推导:
 *   - 本质是 map / flatMap / withFilter 的语法糖
 *   - yield 收集结果
 *   - 守卫 `if cond` 被翻译为 withFilter
 *   - 模式 `pattern <- expr` 等价于 flatMap { case pattern => ... }
 *   - 可用于任何实现 map / flatMap / withFilter 的类型
 */
object ForComprehensions {

  // 自定义 for-capable 类型
  case class Wrap[A](value: A) {
    def map[B](f: A => B): Wrap[B] = Wrap(f(value))
    def flatMap[B](f: A => Wrap[B]): Wrap[B] = f(value)
  }

  // 在 Either 上使用 for
  def divide(a: Int, b: Int): Either[String, Int] =
    if (b == 0) Left(s"division by zero") else Right(a / b)

  // 用 for 串两个可能失败的运算
  def safeDivChain(a: Int, b: Int, c: Int): Either[String, Int] = {
    for {
      x <- divide(a, b)
      y <- divide(x, c)
    } yield y
  }

  // 嵌套 + 守卫
  def pairsAndSums(xs: List[Int], ys: List[Int]): List[Int] =
    for {
      x <- xs
      y <- ys
      if (x + y) % 2 == 0
    } yield x + y

  // 在自定义 Wrap 上 for
  val wrapped: Wrap[Int] = for {
    a <- Wrap(10)
    b <- Wrap(20)
  } yield a + b

  // Stream (Scala 2.13) 替代 Scala 2.12 之前的 Stream
  lazy val naturals: Stream[Int] = Stream.from(1)
  val firstTenSquares: Vector[Int] = naturals.take(10).map(n => n * n).toVector
}
