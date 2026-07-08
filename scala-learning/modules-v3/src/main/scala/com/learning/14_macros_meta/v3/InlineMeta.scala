package com.learning.`14_macros_meta`.v3

import scala.compiletime.{constValue, summonFrom, summonInline, error, erasedValue}

/**
 * Scala 3 编译期元编程 —— inline / transparent inline / compiletime.* 系列 API。
 *
 * 不需要任何插件,在编译器内建。
 */
object InlineMeta:

  // 1) inline:在调用点直接展开(对字面量参数强制内联)
  inline def twice(inline n: Int): Int = n * 2

  // 2) transparent inline:返回更精确的类型
  transparent inline def defaultValue[T]: T =
    inline erasedValue[T] match
      case _: Byte    => 0.toByte.asInstanceOf[T]
      case _: Int     => 0.asInstanceOf[T]
      case _: Long    => 0L.asInstanceOf[T]
      case _: Double  => 0.0.asInstanceOf[T]
      case _: Boolean => false.asInstanceOf[T]
      case _: String  => "".asInstanceOf[T]
      case _          => null.asInstanceOf[T]

  // 3) 编译期断言:常量检查
  inline def assertPositive(inline n: Int): Unit =
    if n <= 0 then error("expected positive, got " + n)
    else ()

  // 4) ValueOf:取出字面量类型的运行期值
  inline def constValueOf[N](using ev: ValueOf[N]): N = ev.value

  // 5) 类型级 Tuple 大小
  inline def tupleSize[T <: Tuple]: Int =
    inline erasedValue[T] match
      case _: EmptyTuple      => 0
      case _: (h *: t)         => 1 + tupleSize[t]

  // 6) 编译期 if
  inline def platformCheck: String =
    inline if scala.util.Properties.isMac then "mac" else "other"

  // 7) 递归 inline 求和(收 List[Int] 而非变参)
  // Scala 3 中 vararg 在 inline 内部不能被完全展开为字面量序列,
  // 使用 List[Int] 是 inline 递归展开的标准做法。
  transparent inline def sumOf(inline xs: List[Int]): Int =
    inline xs match
      case Nil       => 0
      case h :: rest => h + sumOf(rest)

  // 8) summonInline 拉取上下文
  inline def requireOrdering[T](using ord: Ordering[T]): Ordering[T] = ord

  // 9) 静态注解
  import scala.annotation.experimental
  @experimental
  class NewApi

  // 10) summonFrom 多层分派
  inline def firstStringLike[T](using ord: Ordering[T]): String =
    summonFrom {
      case ev: Ordering[String] => "string ordering found"
      case _                   => "fallback"
    }
