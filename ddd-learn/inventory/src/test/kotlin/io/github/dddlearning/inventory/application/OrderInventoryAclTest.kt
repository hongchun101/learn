package io.github.dddlearning.inventory.application

import io.github.dddlearning.inventory.domain.ReservationId
import io.github.dddlearning.inventory.domain.ReservationStatus
import io.github.dddlearning.inventory.domain.StockItemId
import io.github.dddlearning.inventory.domain.Sku
import io.github.dddlearning.inventory.domain.WarehouseId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class OrderInventoryAclTest {
    @Test
    fun `primitive order DTO is translated to inventory commands and results`() {
        val seen = ArrayList<ReserveStock>()
        val service = OrderInventoryReservationService { command ->
            seen += command
            ReservationResult(
                reservationId = command.reservationId,
                status = ReservationStatus.RESERVED,
                quantity = command.quantity,
                stock = StockItemSnapshot(
                    StockItemId(command.sku, command.warehouseId),
                    onHand = 10,
                    reserved = command.quantity,
                    available = 10 - command.quantity,
                    version = 2,
                ),
            )
        }

        val result = service.reserve(
            OrderInventoryRequest(
                orderReference = "order-42",
                warehouse = "WH-1",
                lines = listOf(OrderInventoryLineRequest("reservation-42-1", "SKU-1", 3)),
            ),
        )

        assertEquals(
            listOf(ReserveStock(ReservationId("reservation-42-1"), Sku("SKU-1"), WarehouseId("WH-1"), 3)),
            seen,
        )
        assertEquals("order-42", result.orderReference)
        assertEquals("RESERVED", result.reservations.single().status)
    }

    @Test
    fun `request rejects duplicate reservation references`() {
        assertFailsWith<IllegalArgumentException> {
            OrderInventoryRequest(
                orderReference = "order-42",
                warehouse = "WH-1",
                lines = listOf(
                    OrderInventoryLineRequest("same", "SKU-1", 1),
                    OrderInventoryLineRequest("same", "SKU-2", 1),
                ),
            )
        }
    }
}
