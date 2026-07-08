package com.learning.`10_operators`.v3

/**
 * Scala 3 操作符重载:语法与 Scala 2 兼容,但额外提供:
 *   - `transparent inline` 让操作符折叠在编译期发生
 *   - 中缀方法可以直接写 `a + b` 而非 `a.+ (b)`
 *   - 一元方法 `unary_-` 不变
 */
object Operators:

  final case class Vec2(x: Double, y: Double) {
    def +(o: Vec2): Vec2      = Vec2(x + o.x, y + o.y)
    def -(o: Vec2): Vec2      = Vec2(x - o.x, y - o.y)
    def *(s: Double): Vec2    = Vec2(x * s, y * s)
    def dot(o: Vec2): Double  = x * o.x + y * o.y
    def unary_- : Vec2        = Vec2(-x, -y)
    def apply(i: Int): Double = if i == 0 then x else y
    def update(i: Int, v: Double): Vec2 =
      if i == 0 then Vec2(v, y) else Vec2(x, v)
  }

  final case class Money(amount: BigDecimal, currency: String) {
    def +(o: Money): Money =
      require(currency == o.currency, s"currency mismatch: $currency vs ${o.currency}")
      Money(amount + o.amount, currency)
    def unary_- : Money = Money(-amount, currency)
  }

  // 透明内联的 Numeric 包装
  transparent inline def toMoney(n: BigDecimal, c: String): Money = Money(n, c)

  // Ordering:given 而非 implicit
  given moneyOrdering: Ordering[Money] = (a, b) => a.amount.compare(b.amount)
  given vecOrdering: Ordering[Vec2]     = (a, b) =>
    val c = a.x.compare(b.x)
    if c == 0 then a.y.compare(b.y) else c
