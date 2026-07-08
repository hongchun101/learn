package com.learning.`07_pattern_matching`.v3

/**
 * Scala 3 模式匹配：与 Scala 2 几乎完全兼容,但补充：
 *   - 不再需要稳定标识符前缀:大写开头的标识符现在默认视为变量名(无歧义)
 *   - `if` 守卫不再需要括号
 *   - `then` 关键字可与 case 体混用
 *   - match 表达式的穷尽性检查更严格(从 warn 升为 error)
 *   - `Matchable` 限定让 match 在某些场景不再需要
 *   - 提取器更宽松:unapply 返回 Boolean 也可
 */
object Patterns:

  object Even:
    def unapply(n: Int): Option[Int] = if n % 2 == 0 then Some(n) else None

  object Split:
    def unapplySeq(s: String): Option[List[String]] =
      Some(s.split(",").toList)

  // Scala 3 中大小写不再区分常量 vs 变量:val Zero 是 stable identifier,在模式中作为常量匹配
  val Zero = 0

  def describe(x: Any): String = x match
    case Zero                     => "zero"
    case n @ Even()              => s"even $n"
    case n: Int                  => s"int $n"
    case s: String               => s"string $s"
    case (a, b)                  => s"tuple $a $b"
    case List(1, 2, _*)          => "starts 1,2"
    case List(0, rest @ _*)      => s"starts 0, then ${rest.length}"
    case head :: tail            => s"non-empty list, head=$head"
    case Nil                     => "empty list"
    case Some(_) | None          => "option"
    case Split(a, b, c @ _*)     => s"split, first=$a, second=$b, more=${c.length}"
    case Person(name, age) if age >= 18 => s"adult $name"
    case Person(name, _)         => s"minor $name"
    case _                       => "other"

  final case class Person(name: String, age: Int)
