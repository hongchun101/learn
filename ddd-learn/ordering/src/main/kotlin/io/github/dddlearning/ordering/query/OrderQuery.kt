package io.github.dddlearning.ordering.query

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.ordering.domain.Order
import io.github.dddlearning.ordering.domain.OrderCancelled
import io.github.dddlearning.ordering.domain.OrderConfirmed
import io.github.dddlearning.ordering.domain.OrderCreated
import io.github.dddlearning.ordering.domain.OrderId
import io.github.dddlearning.ordering.domain.OrderRejected
import io.github.dddlearning.ordering.domain.OrderRepository
import io.github.dddlearning.ordering.domain.OrderStatus
import io.github.dddlearning.ordering.domain.OrderSubmitted
import java.math.BigDecimal
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

data class OrderLineDto(val id: String, val productId: String, val productName: String, val unitPrice: BigDecimal, val quantity: Int, val subtotal: BigDecimal)
data class OrderDto(
    val id: String,
    val customerId: String,
    val currency: String,
    val status: OrderStatus,
    val lines: List<OrderLineDto>,
    val total: BigDecimal,
    val version: Long,
    val updatedAt: Instant? = null,
    val rejectionReason: String? = null,
)

private fun io.github.dddlearning.ordering.domain.OrderLine.toDto() =
    OrderLineDto(id.value, productId.value, productName, unitPrice.amount, quantity.value, subtotal.amount)

fun Order.toDto(updatedAt: Instant? = null, rejectionReason: String? = null): OrderDto =
    OrderDto(id.value, customerId.value, currency.code, status, lines.map { it.toDto() }, total.amount, version, updatedAt, rejectionReason)

interface OrderQuery { fun findById(id: OrderId): OrderDto? }

class RepositoryOrderQuery(private val repository: OrderRepository) : OrderQuery {
    override fun findById(id: OrderId): OrderDto? = repository.findById(id)?.toDto()
}

class InMemoryOrderProjection : OrderQuery {
    private val orders = ConcurrentHashMap<OrderId, OrderDto>()
    override fun findById(id: OrderId): OrderDto? = orders[id]

    fun project(event: DomainEvent) {
        when (event) {
            is OrderCreated -> orders[event.orderId] = OrderDto(
                event.orderId.value, event.customerId.value, event.currency.code, OrderStatus.DRAFT,
                emptyList(), BigDecimal.ZERO.setScale(event.currency.fractionDigits), 0, event.occurredAt,
            )
            is OrderSubmitted -> orders[event.orderId] = OrderDto(
                event.orderId.value, event.customerId.value, event.total.currency.code, OrderStatus.SUBMITTED,
                event.lines.map { it.toDto() }, event.total.amount, (orders[event.orderId]?.version ?: 0) + 1, event.occurredAt,
            )
            is OrderConfirmed -> update(event.orderId, OrderStatus.CONFIRMED, event.occurredAt)
            is OrderRejected -> update(event.orderId, OrderStatus.REJECTED, event.occurredAt, event.reason)
            is OrderCancelled -> update(event.orderId, OrderStatus.CANCELLED, event.occurredAt)
        }
    }

    private fun update(id: OrderId, status: OrderStatus, at: Instant, reason: String? = null) {
        orders.computeIfPresent(id) { _, current ->
            current.copy(status = status, version = current.version + 1, updatedAt = at, rejectionReason = reason)
        }
    }
}
