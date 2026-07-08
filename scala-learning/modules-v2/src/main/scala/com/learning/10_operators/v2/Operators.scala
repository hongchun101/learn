package com.learning.`10_operators`.v2

/**
 * Scala 2 操作符重载:
 *   - 标识符命名:任何由 + - * / : ? ~ ^ | & < > = ! 开头的 token 都是合法标识符
 *   - 中缀方法只能用单个参数
 *   - 一元方法:unary_+ / unary_- / unary_! / unary_~
 *   - apply / update:模拟 a(i) = b
 */
object Operators {

  final case class Vec2(x: Double, y: Double) {
    def +(o: Vec2): Vec2      = Vec2(x + o.x, y + o.y)
    def -(o: Vec2): Vec2      = Vec2(x - o.x, y - o.y)
    def *(s: Double): Vec2    = Vec2(x * s, y * s)
    def dot(o: Vec2): Double  = x * o.x + y * o.y
    def unary_- : Vec2        = Vec2(-x, -y)
    def apply(i: Int): Double = if (i == 0) x else y
    def update(i: Int, v: Double): Vec2 =
      if (i == 0) Vec2(v, y) else Vec2(x, v)
  }

  // 自定义 Numeric
  final case class Money(amount: BigDecimal, currency: String) {
    def +(o: Money): Money =
      require(currency == o.currency, s"currency mismatch: $currency vs ${o.currency}")
      Money(amount + o.amount, currency)
    def unary_- : Money = Money(-amount, currency)
  }

  // 自定义 Ordering
  implicit val moneyOrdering: Ordering[Money] = (a, b) => a.amount.compare(b.amount)
  implicit val vecOrdering: Ordering[Vec2]     = (a, b) => a.x.compare(b.x) match {
    case 0    => a.y.compare(b.y)
    case other => other
  }
}
