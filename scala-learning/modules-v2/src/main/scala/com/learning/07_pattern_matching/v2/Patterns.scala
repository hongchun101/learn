package com.learning.`07_pattern_matching`.v2

/**
 * Scala 2 模式匹配：
 *   - 字面量模式、通配符 `_`、变量绑定 `@`
 *   - 类型模式 `x: T`
 *   - 构造器模式（case class）
 *   - 提取器模式:unapply / unapplySeq
 *   - 模式守卫 `if cond`
 *   - 模式替代 `|`
 *   - 变量绑定 `name @ pattern`
 *   - 稳定标识符:大写开头的模式为常量引用
 */
object Patterns {

  // 自定义提取器
  object Even {
    def unapply(n: Int): Option[Int] = if (n % 2 == 0) Some(n) else None
  }

  // 序列提取器
  object Split {
    def unapplySeq(s: String): Option[List[String]] =
      Some(s.split(",").toList)
  }

  // 完整 demo
  def describe(x: Any): String = x match {
    case 0                       => "zero"
    case n @ Even()              => s"even $n"           // 提取器 + 绑定
    case n: Int                  => s"int $n"            // 类型模式
    case s: String               => s"string $s"
    case (a, b)                  => s"tuple $a $b"       // 元组
    case List(1, 2, _*)          => "starts 1,2"         // 序列
    case List(0, rest @ _*)      => s"starts 0, then ${rest.length}"
    case head :: tail            => s"non-empty list, head=$head"
    case Nil                     => "empty list"
    case Some(_) | None          => "option"
    case Split(a, b, c @ _*)     => s"split, first=$a, second=$b, more=${c.length}"
    case Person(name, age) if age >= 18 => s"adult $name"
    case Person(name, _)         => s"minor $name"
    case _                       => "other"
  }

  // 用于匹配的自定义 case class
  final case class Person(name: String, age: Int)
}
