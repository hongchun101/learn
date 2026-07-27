package io.github.dddlearning.inventory.domain

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import java.time.Instant

sealed interface InventoryEvent : DomainEvent {
    val stockItemId: StockItemId
}

data class StockReplenished(
    override val eventId: EventId,
    override val occurredAt: Instant,
    override val stockItemId: StockItemId,
    val quantity: Int,
    val onHand: Int,
) : InventoryEvent

data class StockReserved(
    override val eventId: EventId,
    override val occurredAt: Instant,
    override val stockItemId: StockItemId,
    val reservationId: ReservationId,
    val quantity: Int,
) : InventoryEvent

data class StockReservationReleased(
    override val eventId: EventId,
    override val occurredAt: Instant,
    override val stockItemId: StockItemId,
    val reservationId: ReservationId,
    val quantity: Int,
) : InventoryEvent

data class StockReservationCommitted(
    override val eventId: EventId,
    override val occurredAt: Instant,
    override val stockItemId: StockItemId,
    val reservationId: ReservationId,
    val quantity: Int,
) : InventoryEvent
