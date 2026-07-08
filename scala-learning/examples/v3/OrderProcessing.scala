package com.learning.examples.v3

import scala.annotation.implicitNotFound

/**
 * 订单处理 —— Scala 3 综合示例。
 *
 * 业务:把一批 RawOrder 验证、折扣、货币转换、按状态分组、渲染为 JSON。
 */
object OrderProcessing:

  // ---- opaque type ----
  opaque type OrderId = Long
  object OrderId:
    def apply(raw: Long): OrderId            = raw
    extension (id: OrderId) def raw: Long    = id
    def parse(s: String): Option[OrderId]    =
      if s.matches("[0-9]+") then Some(s.toLong) else None

  // ---- ADT:订单与状态 ----
  enum Order:
    case Pending(items: List[Item])
    case Confirmed(items: List[Item], total: Money)
    case Cancelled(reason: String)

  final case class Item(name: String, price: Money, qty: Int):
    def subtotal: Money = price * qty

  // ---- 值类型 Money + 操作符重载 ----
  final case class Money(amount: BigDecimal, currency: String):
    require(amount >= 0, s"money amount must be non-negative: $amount")
    def +(o: Money): Money =
      require(currency == o.currency, s"currency mismatch: $currency vs ${o.currency}")
      Money(amount + o.amount, currency)
    def *(n: Int): Money   = Money(amount * n, currency)
    def unary_- : Money    = Money(-amount, currency)
    def toJson: String     = s"""{"amount":$amount,"currency":"$currency"}"""

  // ---- 输入与错误 ----
  final case class RawOrder(id: String, items: List[RawItem], status: String, code: String)
  final case class RawItem(name: String, price: String, qty: Int)

  enum AppError:
    case ParseError(field: String)
    case InvalidStatus(s: String)
    case DiscountMissing

  // ---- 类型类:DiscountRule ----
  @implicitNotFound("No DiscountRule for status=${S}")
  trait DiscountRule[S]:
    def apply(item: Item): BigDecimal

  given DiscountRule["premium"]   = (_: Item) => 0.20
  given DiscountRule["standard"]  = (_: Item) => 0.05

  // ---- 汇率表 ----
  val rates: Map[String, BigDecimal] = Map("USD" -> 1.0, "EUR" -> 1.10, "CNY" -> 0.14)

  // ---- 业务函数 ----
  def parseItem(ri: RawItem): Either[AppError, Item] =
    for
      price <- scala.util.Try(BigDecimal(ri.price)).toEither.left.map(_ => AppError.ParseError("price"))
      q = ri.qty
      _ <- Either.cond(q > 0, q, AppError.ParseError("qty"))
    yield Item(ri.name, Money(price, "USD"), q)

  def parseOrder(ro: RawOrder): Either[AppError, Order] =
    for
      items  <- ro.items.foldLeft(Right(Nil): Either[AppError, List[Item]]) { (acc, ri) =>
        for
          xs <- acc
          x  <- parseItem(ri)
        yield x :: xs
      }
      status <- ro.status match
        case "PENDING"   => Right(Order.Pending(items))
        case "CONFIRMED" =>
          val total = items.map(_.subtotal).foldLeft(Money(0, "USD"))(_ + _)
          Right(Order.Confirmed(items, total))
        case "CANCELLED" => Right(Order.Cancelled(ro.code))
        case other       => Left(AppError.InvalidStatus(other))
    yield status

  def applyDiscount[S](order: Order)(using ev: DiscountRule[S]): Order = order match
    case Order.Pending(items) =>
      val discounted = items.map { i =>
        val rate = ev.apply(i)
        i.copy(price = i.price * (1 - rate))
      }
      Order.Pending(discounted)
    case other => other

  def convertTo(order: Order, target: String): Order = order match
    case c @ Order.Confirmed(items, total) =>
      val rate   = rates.getOrElse(target, BigDecimal(1))
      val newTot = Money((total.amount * rate).setScale(2, BigDecimal.RoundingMode.HALF_UP), target)
      c.copy(total = newTot)
    case other => other

  def renderJson(orders: List[Order]): String =
    orders.map {
      case Order.Pending(items)          => s"""{"status":"PENDING","items":[${items.map(_.toJson).mkString(",")}]}"""
      case Order.Confirmed(items, total) => s"""{"status":"CONFIRMED","items":[${items.map(_.toJson).mkString(",")}],"total":${total.toJson}}"""
      case Order.Cancelled(reason)       => s"""{"status":"CANCELLED","reason":"$reason"}"""
    }.mkString("[", ",", "]")

  // ---- 端到端 ----
  def pipeline(raws: List[RawOrder], target: String): Either[AppError, String] =
    val parsed: List[Either[AppError, Order]] = raws.map(parseOrder)
    val all: Either[AppError, List[Order]] =
      parsed.foldLeft(Right(Nil): Either[AppError, List[Order]]) { (acc, eo) =>
        for
          xs <- acc
          o  <- eo
        yield o :: xs
      }
    all.map { orders =>
      renderJson(
        orders
          .map(applyDiscount["premium"])
          .map(convertTo(_, target))
          .reverse
      )
    }
