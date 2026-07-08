package com.learning.`15_advanced_types`.v2

/**
 * Scala 2 高级类型：
 *   - 路径依赖类型:outer#Inner 与 path.Inner
 *   - 类型 lambda:`({type L[a] = F[G[a]]})#L`(需要 kind-projector 才有 [F[_], G[_]] => F[G[_]])
 *   - 依赖方法类型(Dependently Typed Method)
 *   - 抽象类型 type
 *   - 自递归类型 F[F]
 */
object AdvancedTypes {

  // 路径依赖:不同实例的 Inner 互不兼容
  class Database {
    class Row
    val empty: Row = new Row
    def create: Row = new Row
  }

  // 类型 lambda(Scala 2 写法,无 kind-projector)
  type EitherTF[F[_], G[_], A] = ({type L[a] = F[G[a]]})#L

  // 依赖方法类型
  trait Length {
    type N
    def value: N
  }
  class Len1 extends Length { type N = Int;    def value = 7 }
  class Len2 extends Length { type N = String; def value = "seven" }

  // HKT 应用:Compose Functor
  trait Functor[F[_]] {
    def map[A, B](fa: F[A])(f: A => B): F[B]
  }

  def compose[F[_], G[_], A, B](fga: F[G[A]])(f: A => B)(implicit F: Functor[F], G: Functor[G]): F[G[B]] =
    F.map(fga)(ga => G.map(ga)(f))
}
