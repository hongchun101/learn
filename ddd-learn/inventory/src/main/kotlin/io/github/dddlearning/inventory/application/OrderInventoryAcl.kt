package io.github.dddlearning.inventory.application

/**
 * Anti-corruption boundary for order submissions. All fields use transport-friendly primitives so
 * callers never need to expose or depend on their own domain model.
 */
data class OrderInventoryRequest(
    val orderReference: String,
    val warehouse: String,
    val lines: List<OrderInventoryLineRequest>,
) {
    init {
        require(orderReference.isNotBlank()) { "Order reference must not be blank" }
        require(warehouse.isNotBlank()) { "Warehouse must not be blank" }
        require(lines.isNotEmpty()) { "Order must contain at least one inventory line" }
        require(lines.map { it.reservationReference }.distinct().size == lines.size) {
            "Reservation references must be unique within an order request"
        }
    }
}

data class OrderInventoryLineRequest(
    val reservationReference: String,
    val sku: String,
    val quantity: Int,
) {
    init {
        require(reservationReference.isNotBlank()) { "Reservation reference must not be blank" }
        require(sku.isNotBlank()) { "SKU must not be blank" }
        require(quantity > 0) { "Quantity must be positive" }
    }
}

data class OrderInventoryResult(
    val orderReference: String,
    val reservations: List<OrderInventoryLineResult>,
)

data class OrderInventoryLineResult(
    val reservationReference: String,
    val sku: String,
    val quantity: Int,
    val status: String,
)

class OrderInventoryReservationService(
    private val reserveStock: CommandHandlerAdapter,
) {
    fun reserve(request: OrderInventoryRequest): OrderInventoryResult {
        val warehouseId = io.github.dddlearning.inventory.domain.WarehouseId(request.warehouse)
        val results = request.lines.map { line ->
            val result = reserveStock.reserve(
                ReserveStock(
                    reservationId = io.github.dddlearning.inventory.domain.ReservationId(line.reservationReference),
                    sku = io.github.dddlearning.inventory.domain.Sku(line.sku),
                    warehouseId = warehouseId,
                    quantity = line.quantity,
                ),
            )
            OrderInventoryLineResult(
                reservationReference = result.reservationId.value,
                sku = line.sku,
                quantity = result.quantity,
                status = result.status.name,
            )
        }
        return OrderInventoryResult(request.orderReference, results)
    }

    fun interface CommandHandlerAdapter {
        fun reserve(command: ReserveStock): ReservationResult
    }
}
