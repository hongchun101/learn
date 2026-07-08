package com.learning.`06_generics`.v3

/**
 * Scala 3 泛型与高阶类型：
 *   - 与 Scala 2 相同的型变 / 上界 / 下界
 *   - 类型 lambda 不再需要 kind-projector:`[F[_]] =>> F[G[A]]`
 *   - `Matchable` 替代 Any 作为"可模式匹配"的可见父类
 *   - 多重上界 `A :| T :| U` (or using conjunction)
 *   - 上下文约束 `T :| Ord` 与 using 链
 *   - 抽象类型仍然用 `type T`
 */
object Generics:

  enum List[+A]:
    case Nil
    case Cons(head: A, tail: List[A])

  // 逆变
  trait Printer[-A]:
    def print(a: A): String

  // 上界
  def maxOf[T <: Comparable[T]](xs: List[T]): T = xs match
    case List.Nil        => throw new NoSuchElementException
    case List.Cons(h, t) => t.foldLeft(h)((acc, x) => if acc.compareTo(x) < 0 then x else acc)

  // 高阶类型
  trait Functor[F[_]]:
    def map[A, B](fa: F[A])(f: A => B): F[B]

  given listFunctor: Functor[List] with
    def map[A, B](fa: List[A])(f: A => B): List[B] = fa match
      case List.Nil        => List.Nil
      case List.Cons(h, t) => List.Cons(f(h), summon[Functor[List]].map(t)(f))

  // 类型 lambda:原生语法,无插件
  type Composed[F[_], G[_]] = [A] =>> F[G[A]]

  // 组合 Functor:使用 using 拉取类型类实例
  def compose[F[_], G[_], A](fa: F[G[A]])(using F: Functor[F], G: Functor[G]): F[G[A]] =
    F.map(fa)(ga => G.map(ga)(identity))

  // 多重上界 + 上下文约束
  trait Showable:
    def show: String

  def showAll[T <: Showable](xs: List[T]): List[String] = xs match
    case List.Nil        => List.Nil
    case List.Cons(h, t) => List.Cons(h.show, showAll(t))
