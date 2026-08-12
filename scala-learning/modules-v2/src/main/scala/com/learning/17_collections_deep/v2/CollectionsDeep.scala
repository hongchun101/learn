package com.learning.`17_collections_deep`.v2

/**
 * M17 —— 集合库深度(Scala 2 版)。
 *
 * 关键点:
 *   - List / Vector / Map / Set 的复杂度
 *   - view 与懒求值
 *   - LazyList 与无限流
 *   - foldLeft 与 foldRight 的差异
 *   - Option / Either 也"是"集合(for 一致)
 */
object CollectionsDeep {

  // -------------------------------------------------------------------------
  // 1) 自定义 List 与 Vector
  // -------------------------------------------------------------------------
  sealed trait MyList[+A]
  case object MyNil                              extends MyList[Nothing]
  case class  MyCons[A](head: A, tail: MyList[A]) extends MyList[A]

  // 头 O(1), 构造 O(1)
  def myCons[A](a: A, rest: MyList[A]): MyList[A] = MyCons(a, rest)

  // 反例: append 是 O(n)
  def myAppend[A](xs: MyList[A], y: A): MyList[A] = xs match {
    case MyNil       => MyCons(y, MyNil)
    case MyCons(h, t) => MyCons(h, myAppend(t, y))
  }

  // -------------------------------------------------------------------------
  // 2) 复杂度演示
  // -------------------------------------------------------------------------
  def benchAppendList(n: Int): Long = {
    val t0 = System.nanoTime()
    var xs: MyList[Int] = MyNil
    var i = 0
    while (i < n) { xs = myAppend(xs, i); i += 1 }
    System.nanoTime() - t0
  }

  def benchBuildVector(n: Int): Long = {
    val t0 = System.nanoTime()
    var xs: Vector[Int] = Vector.empty
    var i = 0
    while (i < n) { xs = xs :+ i; i += 1 }
    System.nanoTime() - t0
  }

  // -------------------------------------------------------------------------
  // 3) view 的工作原理
  // -------------------------------------------------------------------------
  def lazySumSquares(xs: List[Int]): Int = {
    // 不使用 view:产生 3 个中间 List
    val r1 = xs.map(_ * 2)            // List[Int]
    val r2 = r1.filter(_ > 100)        // List[Int]
    r2.take(5).sum
  }

  def lazySumSquaresView(xs: List[Int]): Int = {
    // 使用 view:融合成一个遍历
    xs.view.map(_ * 2).filter(_ > 100).take(5).sum
  }

  // -------------------------------------------------------------------------
  // 4) LazyList(懒求值)
  // -------------------------------------------------------------------------
  lazy val naturals: Stream[Int] = Stream.from(1)
  def firstTenSquares: Vector[Int] = naturals.take(10).map(n => n * n).toVector

  // -------------------------------------------------------------------------
  // 5) foldLeft vs foldRight
  // -------------------------------------------------------------------------
  def foldLeftSum(xs: List[Int]): Int = xs.foldLeft(0)(_ + _)
  def foldRightSum(xs: List[Int]): Int = xs.foldRight(0)(_ + _)

  // 协递归:用 Stream 实现
  def fibsFrom(a: Int, b: Int): Stream[Int] = a #:: fibsFrom(b, a + b)
  val fibs: Stream[Int] = fibsFrom(0, 1)

  // -------------------------------------------------------------------------
  // 6) Option / Either 上的 for
  // -------------------------------------------------------------------------
  def safeDivide(a: Int, b: Int): Either[String, Int] =
    if (b == 0) Left(s"division by zero") else Right(a / b)

  def workflow(a: Int, b: Int, c: Int): Either[String, Int] =
    for {
      x <- safeDivide(a, b)
      y <- safeDivide(x, c)
    } yield y

  // -------------------------------------------------------------------------
  // 7) Map 与 Set 的常用操作
  // -------------------------------------------------------------------------
  def countWords(text: String): Map[String, Int] =
    text.split("\\s+").toList.groupBy(identity).view.mapValues(_.size).toMap

  // -------------------------------------------------------------------------
  // 8) 端到端 demo
  // -------------------------------------------------------------------------
  def run(): Unit = {
    // 1) List append 慢
    val listMs  = benchAppendList(5000) / 1e6
    val vecMs   = benchBuildVector(5000) / 1e6
    println(s"List append 5000: $listMs ms")
    println(s"Vector append 5000: $vecMs ms")
    assert(vecMs < listMs * 100)  // Vector 显著快(注意:这个 assert 可能因机器而异)

    // 2) view 给出相同结果
    val xs = (1 to 1000).toList
    assert(lazySumSquares(xs) == lazySumSquaresView(xs))

    // 3) Stream 前 10 平方
    assert(firstTenSquares == Vector(1, 4, 9, 16, 25, 36, 49, 64, 81, 100))

    // 4) fold
    assert(foldLeftSum(List(1, 2, 3, 4)) == 10)
    assert(foldRightSum(List(1, 2, 3, 4)) == 10)

    // 5) for on Either
    assert(workflow(100, 5, 2) == Right(10))
    assert(workflow(100, 0, 2).isLeft)

    // 6) word count
    assert(countWords("a b a c b a") == Map("a" -> 3, "b" -> 2, "c" -> 1))

    // 7) fibs
    assert(fibs.take(7).toList == List(0, 1, 1, 2, 3, 5, 8))

    println("M17 Collections Deep (Scala 2) demo passed.")
  }
}
