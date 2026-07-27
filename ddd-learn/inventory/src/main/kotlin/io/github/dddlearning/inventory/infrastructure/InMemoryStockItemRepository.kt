package io.github.dddlearning.inventory.infrastructure

import io.github.dddlearning.inventory.domain.StockItem
import io.github.dddlearning.inventory.domain.StockItemId
import io.github.dddlearning.inventory.port.OptimisticLockException
import io.github.dddlearning.inventory.port.StockItemRepository

class InMemoryStockItemRepository : StockItemRepository {
    private val records = HashMap<StockItemId, Record>()

    @Synchronized
    override fun findById(id: StockItemId): StockItem? = records[id]?.toAggregate()

    @Synchronized
    override fun save(stockItem: StockItem) {
        val persistedVersion = records[stockItem.id]?.version ?: 0L
        if (stockItem.version != persistedVersion) {
            throw OptimisticLockException(stockItem.id, stockItem.version, persistedVersion)
        }

        val nextVersion = persistedVersion + 1
        records[stockItem.id] = Record.from(stockItem, nextVersion)
        stockItem.version = nextVersion
    }

    private data class Record(
        val id: StockItemId,
        val onHand: Int,
        val reservations: Map<io.github.dddlearning.inventory.domain.ReservationId, io.github.dddlearning.inventory.domain.StockReservation>,
        val version: Long,
    ) {
        fun toAggregate(): StockItem = StockItem.reconstitute(id, onHand, reservations, version)

        companion object {
            fun from(stockItem: StockItem, version: Long): Record = Record(
                id = stockItem.id,
                onHand = stockItem.onHand,
                reservations = stockItem.reservations,
                version = version,
            )
        }
    }
}
