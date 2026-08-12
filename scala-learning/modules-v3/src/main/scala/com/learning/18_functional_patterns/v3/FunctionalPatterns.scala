package com.learning.`18_functional_patterns`.v3

/**
 * M18 —— 函数式模式(Scala 3 版)。
 *
 * 不依赖 cats,纯 stdlib 实现:
 *   - Monoid
 *   - Functor(Option)
 *   - traverse / sequence
 *   - State
 *   - Reader
 */
object FunctionalPatterns:

  // -------------------------------------------------------------------------
  // 1) Monoid
  // -------------------------------------------------------------------------
  trait Monoid[A]:
    def empty: A
    def combine(x: A, y: A): A

  object Monoid:
    given intMonoid: Monoid[Int] with
      def empty = 0
      def combine(a: Int, b: Int) = a + b

    given stringMonoid: Monoid[String] with
      def empty = ""
      def combine(a: String, b: String) = a + b

    given [A] => Monoid[List[A]] with
      def empty = Nil
      def combine(a: List[A], b: List[A]) = a ++ b

  def combineAll[A: Monoid](xs: List[A]): A =
    val m = summon[Monoid[A]]
    xs.foldLeft(m.empty)(m.combine)

  // -------------------------------------------------------------------------
  // 2) Functor(在 Option 上)
  // -------------------------------------------------------------------------
  trait Functor[F[_]]:
    def map[A, B](fa: F[A])(f: A => B): F[B]

  given optionFunctor: Functor[Option] with
    def map[A, B](fa: Option[A])(f: A => B): Option[B] = fa.map(f)

  // -------------------------------------------------------------------------
  // 3) traverse / sequence
  // -------------------------------------------------------------------------
  def eitherTraverse[A, B, E](xs: List[A])(f: A => Either[E, B]): Either[E, List[B]] =
    xs.foldRight[Either[E, List[B]]](Right(Nil)) { (a, acc) =>
      for
        b  <- f(a)
        bs <- acc
      yield b :: bs
    }

  def eitherSequence[E, A](xs: List[Either[E, A]]): Either[E, List[A]] =
    eitherTraverse(xs)(identity)

  // -------------------------------------------------------------------------
  // 4) State
  // -------------------------------------------------------------------------
  case class State[S, A](run: S => (S, A))

  object State:
    def apply[S, A](run: S => (S, A)): State[S, A] = new State(run)
    def pure[S, A](a: A): State[S, A] = State(s => (s, a))
    def get[S]: State[S, S] = State(s => (s, s))
    def set[S](s: S): State[S, Unit] = State(_ => (s, ()))

    // Scala 3 实现 flatMap(简化版 Monad)
    extension [S, A](sa: State[S, A]) def flatMap[B](f: A => State[S, B]): State[S, B] = State { s0 =>
      val (s1, a) = sa.run(s0)
      f(a).run(s1)
    }

  // -------------------------------------------------------------------------
  // 5) Reader(用 curry)
  // -------------------------------------------------------------------------
  type Reader[R, A] = R => A

  object Reader:
    def pure[R, A](a: A): Reader[R, A] = _ => a
    def ask[R]: Reader[R, R] = identity

  // -------------------------------------------------------------------------
  // 6) 实战
  // -------------------------------------------------------------------------
  def run(): Unit =
    import Monoid.given

    // Monoid
    assert(combineAll(List(1, 2, 3, 4)) == 10)
    assert(combineAll(List("a", "b", "c")) == "abc")
    assert(combineAll(List(List(1), List(2), List(3))) == List(1, 2, 3))

    // Functor
    val o: Option[Int] = Some(42)
    val mapped = optionFunctor.map(o)(_ + 1)
    assert(mapped == Some(43))

    // eitherTraverse
    val r1: Either[String, List[Int]] =
      eitherTraverse(List("1", "2", "3"))(s => scala.util.Try(s.toInt).toEither.left.map(_.getMessage))
    assert(r1 == Right(List(1, 2, 3)))

    val r2 = eitherTraverse(List("1", "x", "3"))(s => scala.util.Try(s.toInt).toEither.left.map(_.getMessage))
    assert(r2.isLeft)

    // sequence
    assert(eitherSequence(List(Right(1), Right(2), Right(3))) == Right(List(1, 2, 3)))
    assert(eitherSequence(List(Right(1), Left("e"), Right(3))).isLeft)

    println("M18 Functional Patterns (Scala 3) demo passed.")
