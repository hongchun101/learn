package io.github.dddlearning.inventory.domain

@JvmInline
value class Sku(val value: String) {
    init {
        require(value.isNotBlank()) { "SKU must not be blank" }
    }

    override fun toString(): String = value
}

@JvmInline
value class WarehouseId(val value: String) {
    init {
        require(value.isNotBlank()) { "Warehouse id must not be blank" }
    }

    override fun toString(): String = value
}

@JvmInline
value class ReservationId(val value: String) {
    init {
        require(value.isNotBlank()) { "Reservation id must not be blank" }
    }

    override fun toString(): String = value
}

data class StockItemId(
    val sku: Sku,
    val warehouseId: WarehouseId,
)

enum class ReservationStatus {
    RESERVED,
    RELEASED,
    COMMITTED,
}

data class StockReservation(
    val id: ReservationId,
    val quantity: Int,
    val status: ReservationStatus,
) {
    init {
        require(quantity > 0) { "Reservation quantity must be positive" }
    }
}
