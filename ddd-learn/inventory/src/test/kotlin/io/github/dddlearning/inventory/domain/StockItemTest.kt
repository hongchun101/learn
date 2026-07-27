package io.github.dddlearning.inventory.domain

import io.github.dddlearning.domain.EventId
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs

class StockItemTest {
    private val stockId = StockItemId(Sku("SKU-1"), WarehouseId("WH-1"))
    private val now = Instant.parse("2026-01-01T00:00:00Z")
    private var eventSequence = 0

    @Test
    fun `reservation cannot exceed available stock`() {
        val stock = stocked(10)
        stock.reserve(ReservationId("r-1"), 7, nextEventId(), now)

        val exception = assertFailsWith<InsufficientStockException> {
            stock.reserve(ReservationId("r-2"), 4, nextEventId(), now)
        }

        assertEquals(3, exception.available)
        assertEquals(10, stock.onHand)
        assertEquals(7, stock.reserved)
        assertEquals(3, stock.available)
    }

    @Test
    fun `quantities must be positive and state remains unchanged on rejection`() {
        val stock = stocked(5)
        stock.pullDomainEvents()

        assertFailsWith<IllegalArgumentException> {
            stock.reserve(ReservationId("r-1"), 0, nextEventId(), now)
        }
        assertFailsWith<IllegalArgumentException> {
            stock.replenish(-1, nextEventId(), now)
        }

        assertEquals(5, stock.onHand)
        assertEquals(0, stock.reserved)
        assertEquals(5, stock.available)
        assertEquals(emptyList(), stock.pullDomainEvents())
    }

    @Test
    fun `same reservation command is idempotent but conflicting quantity is rejected`() {
        val stock = stocked(10)
        stock.pullDomainEvents()
        val reservationId = ReservationId("r-1")

        val first = stock.reserve(reservationId, 4, nextEventId(), now)
        val duplicate = stock.reserve(reservationId, 4, nextEventId(), now)

        assertEquals(first, duplicate)
        assertEquals(4, stock.reserved)
        assertEquals(6, stock.available)
        assertEquals(1, stock.pullDomainEvents().size)
        assertFailsWith<ReservationConflictException> {
            stock.reserve(reservationId, 5, nextEventId(), now)
        }
        assertEquals(4, stock.reserved)
    }

    @Test
    fun `release restores availability and is idempotent`() {
        val stock = stocked(8)
        val reservationId = ReservationId("r-1")
        stock.reserve(reservationId, 5, nextEventId(), now)
        stock.pullDomainEvents()

        val released = stock.release(reservationId, nextEventId(), now)
        val duplicate = stock.release(reservationId, nextEventId(), now)

        assertEquals(ReservationStatus.RELEASED, released.status)
        assertEquals(released, duplicate)
        assertEquals(8, stock.onHand)
        assertEquals(0, stock.reserved)
        assertEquals(8, stock.available)
        assertIs<StockReservationReleased>(stock.pullDomainEvents().single())
        assertFailsWith<InvalidReservationTransitionException> {
            stock.commit(reservationId, nextEventId(), now)
        }
    }

    @Test
    fun `commit consumes on hand and cannot be released afterwards`() {
        val stock = stocked(8)
        val reservationId = ReservationId("r-1")
        stock.reserve(reservationId, 5, nextEventId(), now)
        stock.pullDomainEvents()

        val committed = stock.commit(reservationId, nextEventId(), now)
        val duplicate = stock.commit(reservationId, nextEventId(), now)

        assertEquals(ReservationStatus.COMMITTED, committed.status)
        assertEquals(committed, duplicate)
        assertEquals(3, stock.onHand)
        assertEquals(0, stock.reserved)
        assertEquals(3, stock.available)
        assertIs<StockReservationCommitted>(stock.pullDomainEvents().single())
        assertFailsWith<InvalidReservationTransitionException> {
            stock.release(reservationId, nextEventId(), now)
        }
    }

    @Test
    fun `unknown reservation cannot be released or committed`() {
        val stock = stocked(1)
        val unknown = ReservationId("missing")

        assertFailsWith<ReservationNotFoundException> {
            stock.release(unknown, nextEventId(), now)
        }
        assertFailsWith<ReservationNotFoundException> {
            stock.commit(unknown, nextEventId(), now)
        }
    }

    private fun stocked(quantity: Int): StockItem = StockItem.create(stockId).also {
        it.replenish(quantity, nextEventId(), now)
    }

    private fun nextEventId(): EventId = EventId("event-${++eventSequence}")
}
