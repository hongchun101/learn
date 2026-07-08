package com.learning.`15_advanced_types`.v3

/**
 * Scala 3 高级类型:
 *   - 路径依赖类型语义与 Scala 2 兼容,但更严格(avoid path-dependent issues in match)
 *   - 类型 lambda 一等公民:`[F[_]] =>> F[G[A]]` 原生语法
 *   - 依赖方法类型不变
 *   - 抽象类型 `type T`
 *   - 匹配类型(可选项,需 `-Ykind-projector` 等价通过 3.3 内置)—— 暂不演示
 */
object AdvancedTypes:

  // 路径依赖
  class Database:
    class Row
    val empty: Row = new Row
    def create: Row = new Row

  // 类型 lambda 一等公民
  type Compose[F[_], G[_]] = [A] =>> F[G[A]]

  // 依赖方法类型
  trait Length:
    type N
    def value: N
  class Len1 extends Length:
    type N = Int
    def value = 7
  class Len2 extends Length:
    type N = String
    def value = "seven"

  // HKT 应用
  trait Functor[F[_]]:
    def map[A, B](fa: F[A])(f: A => B): F[B]

  def compose[F[_], G[_], A, B](fga: F[G[A]])(f: A => B)(using F: Functor[F], G: Functor[G]): F[G[B]] =
    F.map(fga)(ga => G.map(ga)(f))
