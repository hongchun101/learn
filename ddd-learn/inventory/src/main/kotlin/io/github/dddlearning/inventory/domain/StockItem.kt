package io.github.dddlearning.inventory.domain

import io.github.dddlearning.domain.AggregateRoot
import io.github.dddlearning.domain.EventId
import java.time.Instant

class InsufficientStockException(
    val requested: Int,
    val available: Int,
) : IllegalStateException("Insufficient stock: requested $requested, available $available")

class ReservationNotFoundException(id: ReservationId) :
    NoSuchElementException("Reservation $id does not exist")

class ReservationConflictException(id: ReservationId) :
    IllegalStateException("Reservation $id already exists with different data")

class InvalidReservationTransitionException(id: ReservationId, from: ReservationStatus, to: ReservationStatus) :
    IllegalStateException("Reservation $id cannot transition from $from to $to")

class StockItem private constructor(
    id: StockItemId,
    onHand: Int,
    reservations: Map<ReservationId, StockReservation>,
    version: Long,
) : AggregateRoot<StockItemId>(id) {

    var onHand: Int = onHand
        private set

    private val reservationsById = LinkedHashMap(reservations)

    var version: Long = version
        internal set

    val reserved: Int
        get() = reservationsById.values
            .asSequence()
            .filter { it.status == ReservationStatus.RESERVED }
            .sumOf { it.quantity }

    val available: Int
        get() = onHand - reserved

    val reservations: Map<ReservationId, StockReservation>
        get() = reservationsById.toMap()

    init {
        require(onHand >= 0) { "On-hand quantity must not be negative" }
        require(version >= 0) { "Version must not be negative" }
        check(reserved <= onHand) { "Reserved quantity must not exceed on-hand quantity" }
    }

    fun replenish(quantity: Int, eventId: EventId, occurredAt: Instant) {
        require(quantity > 0) { "Replenishment quantity must be positive" }
        onHand = Math.addExact(onHand, quantity)
        raise(StockReplenished(eventId, occurredAt, id, quantity, onHand))
    }

    fun reserve(
        reservationId: ReservationId,
        quantity: Int,
        eventId: EventId,
        occurredAt: Instant,
    ): StockReservation {
        require(quantity > 0) { "Reservation quantity must be positive" }
        val existing = reservationsById[reservationId]
        if (existing != null) {
            if (existing.quantity != quantity) throw ReservationConflictException(reservationId)
            return existing
        }
        if (quantity > available) throw InsufficientStockException(quantity, available)

        val reservation = StockReservation(reservationId, quantity, ReservationStatus.RESERVED)
        reservationsById[reservationId] = reservation
        raise(StockReserved(eventId, occurredAt, id, reservationId, quantity))
        return reservation
    }

    fun release(reservationId: ReservationId, eventId: EventId, occurredAt: Instant): StockReservation {
        val reservation = reservation(reservationId)
        if (reservation.status == ReservationStatus.RELEASED) return reservation
        if (reservation.status != ReservationStatus.RESERVED) {
            throw InvalidReservationTransitionException(
                reservationId,
                reservation.status,
                ReservationStatus.RELEASED,
            )
        }

        val released = reservation.copy(status = ReservationStatus.RELEASED)
        reservationsById[reservationId] = released
        raise(StockReservationReleased(eventId, occurredAt, id, reservationId, reservation.quantity))
        return released
    }

    fun commit(reservationId: ReservationId, eventId: EventId, occurredAt: Instant): StockReservation {
        val reservation = reservation(reservationId)
        if (reservation.status == ReservationStatus.COMMITTED) return reservation
        if (reservation.status != ReservationStatus.RESERVED) {
            throw InvalidReservationTransitionException(
                reservationId,
                reservation.status,
                ReservationStatus.COMMITTED,
            )
        }

        onHand -= reservation.quantity
        val committed = reservation.copy(status = ReservationStatus.COMMITTED)
        reservationsById[reservationId] = committed
        raise(StockReservationCommitted(eventId, occurredAt, id, reservationId, reservation.quantity))
        return committed
    }

    private fun reservation(id: ReservationId): StockReservation =
        reservationsById[id] ?: throw ReservationNotFoundException(id)

    companion object {
        fun create(id: StockItemId): StockItem = StockItem(id, 0, emptyMap(), 0)

        fun reconstitute(
            id: StockItemId,
            onHand: Int,
            reservations: Map<ReservationId, StockReservation>,
            version: Long,
        ): StockItem = StockItem(id, onHand, reservations, version)
    }
}
