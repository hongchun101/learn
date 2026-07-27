package io.github.dddlearning.ordering.query

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.ordering.domain.CustomerId
import io.github.dddlearning.ordering.domain.Order
import io.github.dddlearning.ordering.domain.OrderId
import io.github.dddlearning.ordering.domain.OrderLine
import io.github.dddlearning.ordering.domain.OrderLineId
import io.github.dddlearning.ordering.domain.OrderStatus
import io.github.dddlearning.ordering.domain.ProductId
import io.github.dddlearning.ordering.domain.Quantity
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import java.math.BigDecimal
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class InMemoryOrderProjectionTest {
    @Test fun `projection builds submitted snapshot and applies rejection`() {
        val at = Instant.parse("2025-01-01T00:00:00Z")
        val order = Order.create(OrderId("order-1"), CustomerId("customer-1"), Currency.USD, EventId("event-1"), at)
        order.addLine(
            OrderLine(OrderLineId("line-1"), ProductId("product-1"), "Book", Money.of(Currency.USD, BigDecimal.TEN), Quantity(2)),
        )
        order.submit(EventId("event-2"), at.plusSeconds(1))
        order.reject("out of stock", EventId("event-3"), at.plusSeconds(2))
        val projection = InMemoryOrderProjection()
        order.pullDomainEvents().forEach(projection::project)

        val dto = projection.findById(order.id)!!
        assertEquals(OrderStatus.REJECTED, dto.status)
        assertEquals(BigDecimal("20.00"), dto.total)
        assertEquals(1, dto.lines.size)
        assertEquals("out of stock", dto.rejectionReason)
        assertNull(projection.findById(OrderId("missing")))
    }
}
