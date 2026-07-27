package io.github.dddlearning.inventory.application

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.inventory.domain.ReservationId
import io.github.dddlearning.inventory.domain.ReservationStatus
import io.github.dddlearning.inventory.domain.Sku
import io.github.dddlearning.inventory.domain.WarehouseId
import io.github.dddlearning.inventory.infrastructure.InMemoryStockItemRepository
import io.github.dddlearning.port.Clock
import io.github.dddlearning.port.DomainEventPublisher
import io.github.dddlearning.port.IdGenerator
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class InventoryCommandHandlersTest {
    private val repository = InMemoryStockItemRepository()
    private val published = ArrayList<DomainEvent>()
    private var sequence = 0
    private val eventIds = IdGenerator { EventId("event-${++sequence}") }
    private val clock = Clock { Instant.parse("2026-01-01T00:00:00Z") }
    private val publisher = object : DomainEventPublisher {
        override fun publish(event: DomainEvent) {
            published += event
        }

        override fun publishAll(events: Iterable<DomainEvent>) {
            published += events
        }
    }

    @Test
    fun `handlers orchestrate complete reservation workflow`() {
        ReplenishStockHandler(repository, eventIds, clock, publisher).handle(
            ReplenishStock(Sku("SKU-1"), WarehouseId("WH-1"), 10),
        )
        val reserve = ReserveStockHandler(repository, eventIds, clock, publisher)
        val command = ReserveStock(ReservationId("r-1"), Sku("SKU-1"), WarehouseId("WH-1"), 4)

        val reserved = reserve.handle(command)
        val duplicate = reserve.handle(command)
        val committed = CommitStockReservationHandler(repository, eventIds, clock, publisher).handle(
            CommitStockReservation(command.reservationId, command.sku, command.warehouseId),
        )

        assertEquals(ReservationStatus.RESERVED, reserved.status)
        assertEquals(reserved, duplicate)
        assertEquals(ReservationStatus.COMMITTED, committed.status)
        assertEquals(6, committed.stock.onHand)
        assertEquals(0, committed.stock.reserved)
        assertEquals(3, published.size)
    }

    @Test
    fun `reservation requires existing stock item`() {
        val handler = ReserveStockHandler(repository, eventIds, clock, publisher)

        assertFailsWith<StockItemNotFoundException> {
            handler.handle(
                ReserveStock(ReservationId("r-1"), Sku("missing"), WarehouseId("WH-1"), 1),
            )
        }
    }
}
