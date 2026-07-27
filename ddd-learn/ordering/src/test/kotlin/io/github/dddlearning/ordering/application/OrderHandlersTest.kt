package io.github.dddlearning.ordering.application

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.ordering.domain.CustomerId
import io.github.dddlearning.ordering.domain.InMemoryOrderRepository
import io.github.dddlearning.ordering.domain.OrderId
import io.github.dddlearning.ordering.domain.OrderLineId
import io.github.dddlearning.ordering.domain.OrderStatus
import io.github.dddlearning.ordering.domain.OrderSubmitted
import io.github.dddlearning.ordering.domain.ProductId
import io.github.dddlearning.ordering.domain.Quantity
import io.github.dddlearning.port.Clock
import io.github.dddlearning.port.DomainEventPublisher
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import java.math.BigDecimal
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class OrderHandlersTest {
    @Test fun `create add submit handlers persist and publish events`() {
        val repository = InMemoryOrderRepository()
        val published = mutableListOf<DomainEvent>()
        val publisher = object : DomainEventPublisher {
            override fun publish(event: DomainEvent) { published += event }
        }
        val clock = Clock { Instant.parse("2025-01-01T00:00:00Z") }
        var eventNumber = 0
        val eventIds = IdGenerator { EventId("event-${++eventNumber}") }
        val id = CreateOrderHandler(repository, IdGenerator { OrderId("order-1") }, eventIds, clock, publisher)
            .handle(CreateOrderCommand(CustomerId("customer-1"), Currency.USD))
        AddOrderLineHandler(repository, IdGenerator { OrderLineId("line-1") }).handle(
            AddOrderLineCommand(id, ProductId("product-1"), "Book", Money.of(Currency.USD, BigDecimal.TEN), Quantity(2)),
        )
        SubmitOrderHandler(repository, eventIds, clock, publisher).handle(SubmitOrderCommand(id))

        val stored = repository.findById(id)!!
        assertEquals(OrderStatus.SUBMITTED, stored.status)
        assertEquals(BigDecimal("20.00"), stored.total.amount)
        assertEquals(2, published.size)
        assertIs<OrderSubmitted>(published.last())
    }
}
