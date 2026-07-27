package io.github.dddlearning.inventory.application

import io.github.dddlearning.inventory.domain.ReservationId
import io.github.dddlearning.inventory.domain.ReservationStatus
import io.github.dddlearning.inventory.domain.Sku
import io.github.dddlearning.inventory.domain.StockItemId
import io.github.dddlearning.inventory.domain.WarehouseId

data class ReplenishStock(
    val sku: Sku,
    val warehouseId: WarehouseId,
    val quantity: Int,
)

data class ReserveStock(
    val reservationId: ReservationId,
    val sku: Sku,
    val warehouseId: WarehouseId,
    val quantity: Int,
)

data class ReleaseStockReservation(
    val reservationId: ReservationId,
    val sku: Sku,
    val warehouseId: WarehouseId,
)

data class CommitStockReservation(
    val reservationId: ReservationId,
    val sku: Sku,
    val warehouseId: WarehouseId,
)

data class StockItemSnapshot(
    val id: StockItemId,
    val onHand: Int,
    val reserved: Int,
    val available: Int,
    val version: Long,
)

data class ReservationResult(
    val reservationId: ReservationId,
    val status: ReservationStatus,
    val quantity: Int,
    val stock: StockItemSnapshot,
)
