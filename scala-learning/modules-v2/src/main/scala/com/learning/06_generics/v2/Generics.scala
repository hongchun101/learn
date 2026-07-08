package com.learning.`06_generics`.v2

/**
 * Scala 2 泛型与高阶类型：
 *   - 型变：+A(协变) / -A(逆变) / A(不变)
 *   - 上界: A <: B, 下界: A >: B
 *   - 类型约束: T =:= U, T <:< U
 *   - 高阶类型: F[_]（需要 kind-projector 插件或 partial kind）
 *   - 抽象类型:type T
 *   - 存在类型: T forSome { type T }
 */
object Generics {

  // 协变:List[+A] —— Cat <: Animal ⇒ List[Cat] <: List[Animal]
  sealed trait List[+A]
  case object Nil extends List[Nothing]
  final case class Cons[A](head: A, tail: List[A]) extends List[A]

  // 逆变:Function1[-A, +B] —— Function1[Animal, String] <: Function1[Cat, String]
  trait Printer[-A] { def print(a: A): String }

  // 上界
  def maxOf[T <: Comparable[T]](xs: List[T]): T = xs match {
    case Nil          => throw new NoSuchElementException
    case Cons(h, t)   => t.foldLeft(h)((acc, x) => if (acc.compareTo(x) < 0) x else acc)
  }

  // 高阶类型
  trait Functor[F[_]] {
    def map[A, B](fa: F[A])(f: A => B): F[B]
  }

  // Functor for List
  implicit val listFunctor: Functor[List] = new Functor[List] {
    def map[A, B](fa: List[A])(f: A => B): List[B] = fa match {
      case Nil         => Nil
      case Cons(h, t)  => Cons(f(h), map(t)(f))
    }
  }

  // 高阶类型组合（无 kind-projector 时的写法）
  // F[G[A]]  = ({type L[a] = F[G[a]]})#L
  def compose[F[_], G[_], A](fa: F[G[A]])(implicit F: Functor[F], G: Functor[G]): F[G[A]] =
    F.map(fa)(ga => G.map(ga)(identity))

  // 上界 + 上下文约束
  def showAll[T <: Showable](xs: List[T]): List[String] = xs match {
    case Nil        => Nil
    case Cons(h, t) => Cons(h.show, showAll(t))
  }

  trait Showable { def show: String }
}
