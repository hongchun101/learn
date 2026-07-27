package io.github.dddlearning.inventory.application

import io.github.dddlearning.application.CommandHandler
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.inventory.domain.StockItem
import io.github.dddlearning.inventory.domain.StockItemId
import io.github.dddlearning.inventory.port.StockItemRepository
import io.github.dddlearning.port.Clock
import io.github.dddlearning.port.DomainEventPublisher
import io.github.dddlearning.port.IdGenerator

class StockItemNotFoundException(id: StockItemId) : NoSuchElementException("Stock item $id does not exist")

class ReplenishStockHandler(
    private val repository: StockItemRepository,
    private val eventIds: IdGenerator<EventId>,
    private val clock: Clock,
    private val eventPublisher: DomainEventPublisher,
) : CommandHandler<ReplenishStock, StockItemSnapshot> {
    override fun handle(command: ReplenishStock): StockItemSnapshot {
        val id = StockItemId(command.sku, command.warehouseId)
        val stockItem = repository.findById(id) ?: StockItem.create(id)
        stockItem.replenish(command.quantity, eventIds.nextId(), clock.now())
        repository.save(stockItem)
        eventPublisher.publishAll(stockItem.pullDomainEvents())
        return stockItem.snapshot()
    }
}

class ReserveStockHandler(
    private val repository: StockItemRepository,
    private val eventIds: IdGenerator<EventId>,
    private val clock: Clock,
    private val eventPublisher: DomainEventPublisher,
) : CommandHandler<ReserveStock, ReservationResult> {
    override fun handle(command: ReserveStock): ReservationResult {
        val stockItem = repository.required(command.sku, command.warehouseId)
        val reservation = stockItem.reserve(
            command.reservationId,
            command.quantity,
            eventIds.nextId(),
            clock.now(),
        )
        persistIfChanged(stockItem)
        return ReservationResult(reservation.id, reservation.status, reservation.quantity, stockItem.snapshot())
    }

    private fun persistIfChanged(stockItem: StockItem) {
        if (stockItem.peekDomainEvents().isEmpty()) return
        repository.save(stockItem)
        eventPublisher.publishAll(stockItem.pullDomainEvents())
    }
}

class ReleaseStockReservationHandler(
    private val repository: StockItemRepository,
    private val eventIds: IdGenerator<EventId>,
    private val clock: Clock,
    private val eventPublisher: DomainEventPublisher,
) : CommandHandler<ReleaseStockReservation, ReservationResult> {
    override fun handle(command: ReleaseStockReservation): ReservationResult {
        val stockItem = repository.required(command.sku, command.warehouseId)
        val reservation = stockItem.release(command.reservationId, eventIds.nextId(), clock.now())
        persistIfChanged(stockItem)
        return ReservationResult(reservation.id, reservation.status, reservation.quantity, stockItem.snapshot())
    }

    private fun persistIfChanged(stockItem: StockItem) {
        if (stockItem.peekDomainEvents().isEmpty()) return
        repository.save(stockItem)
        eventPublisher.publishAll(stockItem.pullDomainEvents())
    }
}

class CommitStockReservationHandler(
    private val repository: StockItemRepository,
    private val eventIds: IdGenerator<EventId>,
    private val clock: Clock,
    private val eventPublisher: DomainEventPublisher,
) : CommandHandler<CommitStockReservation, ReservationResult> {
    override fun handle(command: CommitStockReservation): ReservationResult {
        val stockItem = repository.required(command.sku, command.warehouseId)
        val reservation = stockItem.commit(command.reservationId, eventIds.nextId(), clock.now())
        persistIfChanged(stockItem)
        return ReservationResult(reservation.id, reservation.status, reservation.quantity, stockItem.snapshot())
    }

    private fun persistIfChanged(stockItem: StockItem) {
        if (stockItem.peekDomainEvents().isEmpty()) return
        repository.save(stockItem)
        eventPublisher.publishAll(stockItem.pullDomainEvents())
    }
}

private fun StockItemRepository.required(
    sku: io.github.dddlearning.inventory.domain.Sku,
    warehouseId: io.github.dddlearning.inventory.domain.WarehouseId,
): StockItem {
    val id = StockItemId(sku, warehouseId)
    return findById(id) ?: throw StockItemNotFoundException(id)
}

private fun StockItem.snapshot(): StockItemSnapshot = StockItemSnapshot(
    id = id,
    onHand = onHand,
    reserved = reserved,
    available = available,
    version = version,
)
