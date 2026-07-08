package com.learning.examples.v2

import scala.annotation.implicitNotFound

/**
 * 订单处理 —— Scala 2 综合示例。
 *
 * 业务:把一批 RawOrder 验证、折扣、货币转换、按状态分组、渲染为 JSON。
 */
object OrderProcessing {

  // ---- 值类 ----
  final class OrderId(val raw: Long) extends AnyVal {
    override def toString: String = s"OrderId($raw)"
  }
  object OrderId {
    def parse(s: String): Option[OrderId] =
      if (s.matches("[0-9]+")) Some(new OrderId(s.toLong)) else None
  }

  // ---- ADT:订单与状态 ----
  sealed trait Order
  final case class Pending(items: List[Item])           extends Order
  final case class Confirmed(items: List[Item], total: Money) extends Order
  final case class Cancelled(reason: String)            extends Order

  final case class Item(name: String, price: Money, qty: Int) {
    def subtotal: Money = price * qty
  }

  // ---- 值类型 Money + 操作符重载 ----
  final case class Money(amount: BigDecimal, currency: String) {
    require(amount >= 0, s"money amount must be non-negative: $amount")
    def +(o: Money): Money = {
      require(currency == o.currency, s"currency mismatch: $currency vs ${o.currency}")
      Money(amount + o.amount, currency)
    }
    def *(n: Int): Money   = Money(amount * n, currency)
    def unary_- : Money    = Money(-amount, currency)
    def toJson: String     = s"""{"amount":$amount,"currency":"$currency"}"""
  }

  // ---- 输入与错误 ----
  final case class RawOrder(id: String, items: List[RawItem], status: String, code: String)
  final case class RawItem(name: String, price: String, qty: Int)

  sealed trait AppError
  case class ParseError(field: String)   extends AppError
  case class InvalidStatus(s: String)    extends AppError
  case object DiscountMissing            extends AppError

  // ---- 类型类:Discount ----
  @implicitNotFound("No DiscountRule for status=${S}")
  trait DiscountRule[S] {
    def apply(item: Item): BigDecimal   // 返回 [0, 1) 的折扣率
  }
  implicit object PremiumDiscount extends DiscountRule["premium"] {
    def apply(item: Item): BigDecimal = 0.20
  }
  implicit object StandardDiscount extends DiscountRule["standard"] {
    def apply(item: Item): BigDecimal = 0.05
  }

  // ---- 汇率表(运行时配置) ----
  val rates: Map[String, BigDecimal] = Map("USD" -> 1.0, "EUR" -> 1.10, "CNY" -> 0.14)

  // ---- 业务函数 ----
  def parseItem(ri: RawItem): Either[AppError, Item] =
    for {
      price <- scala.util.Try(BigDecimal(ri.price)).toEither.left.map(_ => ParseError("price"))
      q = ri.qty
      _ <- Either.cond(q > 0, q, ParseError("qty"))
    } yield Item(ri.name, Money(price, "USD"), q)

  def parseOrder(ro: RawOrder): Either[AppError, Order] = {
    val itemsE: Either[AppError, List[Item]] = ro.items.foldLeft(Right(Nil): Either[AppError, List[Item]]) {
      (acc, ri) => for {
        xs <- acc
        x  <- parseItem(ri)
      } yield x :: xs
    }
    for {
      items  <- itemsE
      status <- ro.status match {
        case "PENDING"   => Right(Pending(items): Order)
        case "CONFIRMED" =>
          val total = items.map(_.subtotal).foldLeft(Money(0, "USD"))(_ + _)
          Right(Confirmed(items, total): Order)
        case "CANCELLED" => Right(Cancelled(ro.code): Order)
        case other       => Left(InvalidStatus(other))
      }
    } yield status
  }

  def applyDiscount[S](order: Order)(implicit ev: DiscountRule[S]): Order = order match {
    case Pending(items) =>
      val discounted = items.map { i =>
        val rate = ev.apply(i)
        i.copy(price = i.price * (1 - rate))
      }
      Pending(discounted)
    case other => other
  }

  def convertTo(order: Order, target: String): Order = order match {
    case c @ Confirmed(items, total) =>
      val rate   = rates.getOrElse(target, BigDecimal(1))
      val newTot = Money((total.amount * rate).setScale(2, BigDecimal.RoundingMode.HALF_UP), target)
      c.copy(total = newTot)
    case other => other
  }

  def renderJson(orders: List[Order]): String =
    orders.map {
      case Pending(items)         => s"""{"status":"PENDING","items":[${items.map(_.toJson).mkString(",")}]}"""
      case Confirmed(items, total) => s"""{"status":"CONFIRMED","items":[${items.map(_.toJson).mkString(",")}],"total":${total.toJson}}"""
      case Cancelled(reason)      => s"""{"status":"CANCELLED","reason":"$reason"}"""
    }.mkString("[", ",", "]")

  // ---- 端到端 ----
  def pipeline(raws: List[RawOrder], target: String): Either[AppError, String] = {
    val parsed: List[Either[AppError, Order]] = raws.map(parseOrder)
    val all: Either[AppError, List[Order]] =
      parsed.foldLeft(Right(Nil): Either[AppError, List[Order]]) { (acc, eo) =>
        for {
          xs <- acc
          o  <- eo
        } yield o :: xs
      }
    all.map { orders =>
      // 这里用 import 把 PremiumDiscount 显式带入隐式作用域
      import OrderProcessing._
      val discounted: List[Order] = orders.map(o => applyDiscount[("premium": String)](o))
      val converted: List[Order] = discounted.map(convertTo(_, target))
      renderJson(converted.reverse)
    }
  }
}

