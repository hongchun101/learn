package io.github.dddlearning.ordering.domain

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.reliability.OptimisticLockingException
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import java.math.BigDecimal
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class InMemoryOrderRepositoryTest {
    @Test fun `stale aggregate save is rejected without overwriting current snapshot`() {
        val repository = InMemoryOrderRepository()
        val at = Instant.parse("2025-01-01T00:00:00Z")
        val order = Order.create(OrderId("order-1"), CustomerId("customer-1"), Currency.USD, EventId("event-1"), at)
        repository.save(order, 0)
        val current = repository.findById(order.id)!!
        val stale = repository.findById(order.id)!!
        current.addLine(
            OrderLine(OrderLineId("line-1"), ProductId("product-1"), "Book", Money.of(Currency.USD, BigDecimal.TEN), Quantity(1)),
        )
        repository.save(current, current.version)
        stale.cancel(EventId("event-2"), at)

        assertFailsWith<OptimisticLockingException> { repository.save(stale, stale.version) }
        val stored = repository.findById(order.id)!!
        assertEquals(OrderStatus.DRAFT, stored.status)
        assertEquals(1, stored.lines.size)
        assertEquals(2, stored.version)
    }
}
