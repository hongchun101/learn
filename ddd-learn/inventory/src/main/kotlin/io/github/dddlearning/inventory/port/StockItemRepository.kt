package io.github.dddlearning.inventory.port

import io.github.dddlearning.inventory.domain.StockItem
import io.github.dddlearning.inventory.domain.StockItemId

interface StockItemRepository {
    fun findById(id: StockItemId): StockItem?

    /**
     * Stores the aggregate only if [StockItem.version] still matches the persisted version.
     * A successful save advances the aggregate version by one.
     */
    fun save(stockItem: StockItem)
}

class OptimisticLockException(
    val stockItemId: StockItemId,
    val expectedVersion: Long,
    val actualVersion: Long,
) : IllegalStateException(
    "Concurrent update of $stockItemId: expected version $expectedVersion, actual version $actualVersion",
)
