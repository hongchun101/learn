package com.learning.`17_collections_deep`.v3

/**
 * M17 —— 集合库深度(Scala 3 版)。
 *
 * 关键点:
 *   - LazyList 替代 Stream(Scala 2)
 *   - 用 `if cond then` 风格
 *   - enum 替代 sealed trait + case object
 *   - for-yield 语法变化
 */
object CollectionsDeep:

  // -------------------------------------------------------------------------
  // 1) 自定义 List
  // -------------------------------------------------------------------------
  enum MyList[+A]:
    case MyNil
    case MyCons(head: A, tail: MyList[A])

  import MyList.*

  def myCons[A](a: A, rest: MyList[A]): MyList[A] = MyCons(a, rest)

  def myAppend[A](xs: MyList[A], y: A): MyList[A] = xs match
    case MyNil       => MyCons(y, MyNil)
    case MyCons(h, t) => MyCons(h, myAppend(t, y))

  // -------------------------------------------------------------------------
  // 2) 复杂度演示
  // -------------------------------------------------------------------------
  def benchAppendList(n: Int): Long =
    val t0 = System.nanoTime()
    var xs: MyList[Int] = MyNil
    var i = 0
    while i < n do
      xs = myAppend(xs, i)
      i += 1
    System.nanoTime() - t0

  def benchBuildVector(n: Int): Long =
    val t0 = System.nanoTime()
    var xs: Vector[Int] = Vector.empty
    var i = 0
    while i < n do
      xs = xs :+ i
      i += 1
    System.nanoTime() - t0

  // -------------------------------------------------------------------------
  // 3) view
  // -------------------------------------------------------------------------
  def lazySumSquares(xs: List[Int]): Int =
    xs.map(_ * 2).filter(_ > 100).take(5).sum

  def lazySumSquaresView(xs: List[Int]): Int =
    xs.view.map(_ * 2).filter(_ > 100).take(5).sum

  // -------------------------------------------------------------------------
  // 4) LazyList
  // -------------------------------------------------------------------------
  lazy val naturals: LazyList[Int] = LazyList.from(1)
  def firstTenSquares: Vector[Int] = naturals.take(10).map(n => n * n).toVector

  // -------------------------------------------------------------------------
  // 5) fold
  // -------------------------------------------------------------------------
  def foldLeftSum(xs: List[Int]): Int = xs.foldLeft(0)(_ + _)
  def foldRightSum(xs: List[Int]): Int = xs.foldRight(0)(_ + _)

  def fibsFrom(a: BigInt, b: BigInt): LazyList[BigInt] =
    a #:: fibsFrom(b, a + b)

  val fibs: LazyList[BigInt] = fibsFrom(0, 1)

  // -------------------------------------------------------------------------
  // 6) for on Either
  // -------------------------------------------------------------------------
  def safeDivide(a: Int, b: Int): Either[String, Int] =
    if b == 0 then Left(s"division by zero") else Right(a / b)

  def workflow(a: Int, b: Int, c: Int): Either[String, Int] =
    for
      x <- safeDivide(a, b)
      y <- safeDivide(x, c)
    yield y

  // -------------------------------------------------------------------------
  // 7) Map 操作
  // -------------------------------------------------------------------------
  def countWords(text: String): Map[String, Int] =
    text.split("\\s+").toList.groupBy(identity).view.mapValues(_.size).toMap

  // -------------------------------------------------------------------------
  // 8) 端到端
  // -------------------------------------------------------------------------
  def run(): Unit =
    val listMs = benchAppendList(5000) / 1e6
    val vecMs  = benchBuildVector(5000) / 1e6
    println(s"List append 5000: $listMs ms")
    println(s"Vector append 5000: $vecMs ms")
    assert(vecMs < listMs * 100)

    val xs = (1 to 1000).toList
    assert(lazySumSquares(xs) == lazySumSquaresView(xs))

    assert(firstTenSquares == Vector(1, 4, 9, 16, 25, 36, 49, 64, 81, 100))

    assert(foldLeftSum(List(1, 2, 3, 4)) == 10)
    assert(foldRightSum(List(1, 2, 3, 4)) == 10)

    assert(workflow(100, 5, 2) == Right(10))
    assert(workflow(100, 0, 2).isLeft)

    assert(countWords("a b a c b a") == Map("a" -> 3, "b" -> 2, "c" -> 1))

    assert(fibs.take(7).toList == List(0, 1, 1, 2, 3, 5, 8))

    println("M17 Collections Deep (Scala 3) demo passed.")
