package com.learning.`11_for_collections`.v3

/**
 * Scala 3 for 推导:
 *   - 语法与 Scala 2 兼容,但内部可使用 `if ... then` 形式
 *   - LazyList 替代 Scala 2.13 的 Stream(更纯,head 强制)
 *   - for 的内部翻译与 Scala 2 相同:map / flatMap / withFilter
 */
object ForComprehensions:

  // 自定义 for-capable 类型
  case class Wrap[A](value: A) {
    def map[B](f: A => B): Wrap[B] = Wrap(f(value))
    def flatMap[B](f: A => Wrap[B]): Wrap[B] = f(value)
  }

  // Either 上的 for
  def divide(a: Int, b: Int): Either[String, Int] =
    if b == 0 then Left(s"division by zero") else Right(a / b)

  def safeDivChain(a: Int, b: Int, c: Int): Either[String, Int] =
    for
      x <- divide(a, b)
      y <- divide(x, c)
    yield y

  def pairsAndSums(xs: List[Int], ys: List[Int]): List[Int] =
    for
      x <- xs
      y <- ys
      if (x + y) % 2 == 0
    yield x + y

  val wrapped: Wrap[Int] = for
    a <- Wrap(10)
    b <- Wrap(20)
  yield a + b

  // LazyList 替代 Stream
  lazy val naturals: LazyList[Int] = LazyList.from(1)
  val firstTenSquares: Vector[Int] = naturals.take(10).map(n => n * n).toVector

  // for 用于 Option:标准习语
  val maybeSum: Option[Int] = for
    a <- Some(1)
    b <- Some(2)
    c <- Some(3)
  yield a + b + c
