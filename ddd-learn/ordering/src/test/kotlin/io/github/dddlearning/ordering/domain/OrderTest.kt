package io.github.dddlearning.ordering.domain

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import java.math.BigDecimal
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs

class OrderTest {
    private val at = Instant.parse("2025-01-01T00:00:00Z")
    private fun event(number: Int) = EventId("event-$number")
    private fun draft() = Order.create(OrderId("order-1"), CustomerId("customer-1"), Currency.USD, event(1), at)
    private fun line(quantity: Int = 2) = OrderLine(
        OrderLineId("line-1"), ProductId("product-1"), "Book",
        Money.of(Currency.USD, BigDecimal("12.50")), Quantity(quantity),
    )

    @Test fun `factory raises created event and line changes update total`() {
        val order = draft()
        assertIs<OrderCreated>(order.pullDomainEvents().single())
        order.addLine(line())
        order.changeQuantity(OrderLineId("line-1"), Quantity(3))
        assertEquals(Money.of(Currency.USD, BigDecimal("37.50")), order.total)
    }

    @Test fun `empty order cannot submit and submitted order cannot mutate`() {
        val order = draft().also { it.pullDomainEvents() }
        assertFailsWith<EmptyOrderException> { order.submit(event(2), at) }
        order.addLine(line())
        order.submit(event(3), at)
        assertEquals(OrderStatus.SUBMITTED, order.status)
        assertIs<OrderSubmitted>(order.pullDomainEvents().single())
        assertFailsWith<IllegalOrderTransitionException> { order.removeLine(OrderLineId("line-1")) }
    }

    @Test fun `terminal transitions are guarded`() {
        val confirmed = draft().also { it.addLine(line()); it.submit(event(2), at); it.confirm(event(3), at) }
        assertEquals(OrderStatus.CONFIRMED, confirmed.status)
        assertFailsWith<IllegalOrderTransitionException> { confirmed.cancel(event(4), at) }

        val rejected = draft().also { it.addLine(line()); it.submit(event(5), at); it.reject("out of stock", event(6), at) }
        assertEquals(OrderStatus.REJECTED, rejected.status)
        assertIs<OrderRejected>(rejected.pullDomainEvents().last())
    }

    @Test fun `line currency must match order`() {
        val euroLine = line().copy(unitPrice = Money.of(Currency.EUR, BigDecimal.ONE))
        assertFailsWith<OrderCurrencyMismatchException> { draft().addLine(euroLine) }
    }
}
