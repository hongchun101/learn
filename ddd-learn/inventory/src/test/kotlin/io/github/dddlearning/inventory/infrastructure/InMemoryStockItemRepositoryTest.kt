package io.github.dddlearning.inventory.infrastructure

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.inventory.domain.ReservationId
import io.github.dddlearning.inventory.domain.Sku
import io.github.dddlearning.inventory.domain.StockItem
import io.github.dddlearning.inventory.domain.StockItemId
import io.github.dddlearning.inventory.domain.WarehouseId
import io.github.dddlearning.inventory.port.OptimisticLockException
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class InMemoryStockItemRepositoryTest {
    private val id = StockItemId(Sku("SKU-1"), WarehouseId("WH-1"))
    private val now = Instant.parse("2026-01-01T00:00:00Z")

    @Test
    fun `repository returns detached copies and increments versions`() {
        val repository = InMemoryStockItemRepository()
        val original = StockItem.create(id)
        original.replenish(10, EventId("e-1"), now)

        repository.save(original)
        val loaded = requireNotNull(repository.findById(id))
        loaded.reserve(ReservationId("r-1"), 3, EventId("e-2"), now)
        repository.save(loaded)

        assertEquals(1, original.version)
        assertEquals(2, loaded.version)
        assertEquals(7, repository.findById(id)?.available)
        assertEquals(10, original.available)
    }

    @Test
    fun `stale aggregate cannot overwrite a concurrent save`() {
        val repository = InMemoryStockItemRepository()
        repository.save(StockItem.create(id))
        val firstReader = requireNotNull(repository.findById(id))
        val staleReader = requireNotNull(repository.findById(id))

        firstReader.replenish(5, EventId("e-1"), now)
        repository.save(firstReader)
        staleReader.replenish(7, EventId("e-2"), now)

        val failure = assertFailsWith<OptimisticLockException> {
            repository.save(staleReader)
        }
        assertEquals(1, failure.expectedVersion)
        assertEquals(2, failure.actualVersion)
        assertEquals(5, repository.findById(id)?.onHand)
    }
}
