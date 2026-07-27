package io.github.dddlearning.ordering.domain

import io.github.dddlearning.domain.AggregateRoot
import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.port.Clock
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import java.time.Instant

@JvmInline
value class OrderId(val value: String) {
    init {
        require(value.isNotBlank()) { "OrderId value must not be blank" }
    }

    override fun toString(): String = value
}

@JvmInline
value class CustomerId(val value: String) {
    init {
        require(value.isNotBlank()) { "CustomerId value must not be blank" }
    }

    override fun toString(): String = value
}

@JvmInline
value class ProductId(val value: String) {
    init {
        require(value.isNotBlank()) { "ProductId value must not be blank" }
    }

    override fun toString(): String = value
}

@JvmInline
value class OrderLineId(val value: String) {
    init {
        require(value.isNotBlank()) { "OrderLineId value must not be blank" }
    }

    override fun toString(): String = value
}

@JvmInline
value class Quantity(val value: Int) {
    init {
        require(value > 0) { "Quantity must be greater than zero" }
    }
}

data class OrderLine(
    val id: OrderLineId,
    val productId: ProductId,
    val productName: String,
    val unitPrice: Money,
    val quantity: Quantity,
) {
    init {
        require(productName.isNotBlank()) { "Product name must not be blank" }
        require(unitPrice.amount.signum() >= 0) { "Unit price must not be negative" }
    }

    val subtotal: Money
        get() = unitPrice * quantity.value

    fun withQuantity(quantity: Quantity): OrderLine = copy(quantity = quantity)
}

enum class OrderStatus {
    DRAFT,
    SUBMITTED,
    CONFIRMED,
    REJECTED,
    CANCELLED,
}

sealed class OrderException(message: String) : IllegalStateException(message)

class IllegalOrderTransitionException(
    current: OrderStatus,
    operation: String,
) : OrderException("Cannot $operation order in $current status")

class DuplicateOrderLineException(lineId: OrderLineId) :
    OrderException("Order line $lineId already exists")

class OrderLineNotFoundException(lineId: OrderLineId) :
    OrderException("Order line $lineId does not exist")

class EmptyOrderException : OrderException("An empty order cannot be submitted")

class OrderCurrencyMismatchException(expected: Currency, actual: Currency) :
    OrderException("Order currency $expected does not match line currency $actual")

class InvalidRejectionReasonException : OrderException("Rejection reason must not be blank")

sealed interface OrderEvent : DomainEvent {
    val orderId: OrderId
    val customerId: CustomerId
}

data class OrderCreated(
    override val eventId: EventId,
    override val occurredAt: Instant,
    override val orderId: OrderId,
    override val customerId: CustomerId,
    val currency: Currency,
) : OrderEvent

data class OrderSubmitted(
    override val eventId: EventId,
    override val occurredAt: Instant,
    override val orderId: OrderId,
    override val customerId: CustomerId,
    val lines: List<OrderLine>,
    val total: Money,
) : OrderEvent

data class OrderConfirmed(
    override val eventId: EventId,
    override val occurredAt: Instant,
    override val orderId: OrderId,
    override val customerId: CustomerId,
    val total: Money,
) : OrderEvent

data class OrderRejected(
    override val eventId: EventId,
    override val occurredAt: Instant,
    override val orderId: OrderId,
    override val customerId: CustomerId,
    val reason: String,
) : OrderEvent

data class OrderCancelled(
    override val eventId: EventId,
    override val occurredAt: Instant,
    override val orderId: OrderId,
    override val customerId: CustomerId,
) : OrderEvent

class Order private constructor(
    id: OrderId,
    val customerId: CustomerId,
    val currency: Currency,
    status: OrderStatus,
    lines: List<OrderLine>,
    version: Long,
) : AggregateRoot<OrderId>(id) {
    private val mutableLines = LinkedHashMap<OrderLineId, OrderLine>().apply {
        lines.forEach { line -> put(line.id, line) }
    }

    var status: OrderStatus = status
        private set

    var version: Long = version
        internal set

    val lines: List<OrderLine>
        get() = mutableLines.values.toList()

    val total: Money
        get() = mutableLines.values.fold(Money.zero(currency)) { sum, line -> sum + line.subtotal }

    fun addLine(line: OrderLine) {
        requireDraft("add a line to")
        if (line.unitPrice.currency != currency) {
            throw OrderCurrencyMismatchException(currency, line.unitPrice.currency)
        }
        if (mutableLines.containsKey(line.id)) {
            throw DuplicateOrderLineException(line.id)
        }
        mutableLines[line.id] = line
    }

    fun changeQuantity(lineId: OrderLineId, quantity: Quantity) {
        requireDraft("change a line on")
        val line = mutableLines[lineId] ?: throw OrderLineNotFoundException(lineId)
        mutableLines[lineId] = line.withQuantity(quantity)
    }

    fun removeLine(lineId: OrderLineId) {
        requireDraft("remove a line from")
        if (mutableLines.remove(lineId) == null) {
            throw OrderLineNotFoundException(lineId)
        }
    }

    fun submit(eventId: EventId, occurredAt: Instant) {
        requireStatus(OrderStatus.DRAFT, "submit")
        if (mutableLines.isEmpty()) throw EmptyOrderException()
        status = OrderStatus.SUBMITTED
        raise(
            OrderSubmitted(
                eventId = eventId,
                occurredAt = occurredAt,
                orderId = id,
                customerId = customerId,
                lines = lines,
                total = total,
            ),
        )
    }

    fun confirm(eventId: EventId, occurredAt: Instant) {
        requireStatus(OrderStatus.SUBMITTED, "confirm")
        status = OrderStatus.CONFIRMED
        raise(OrderConfirmed(eventId, occurredAt, id, customerId, total))
    }

    fun reject(reason: String, eventId: EventId, occurredAt: Instant) {
        requireStatus(OrderStatus.SUBMITTED, "reject")
        if (reason.isBlank()) throw InvalidRejectionReasonException()
        status = OrderStatus.REJECTED
        raise(OrderRejected(eventId, occurredAt, id, customerId, reason.trim()))
    }

    fun cancel(eventId: EventId, occurredAt: Instant) {
        if (status != OrderStatus.DRAFT && status != OrderStatus.SUBMITTED) {
            throw IllegalOrderTransitionException(status, "cancel")
        }
        status = OrderStatus.CANCELLED
        raise(OrderCancelled(eventId, occurredAt, id, customerId))
    }

    private fun requireDraft(operation: String) = requireStatus(OrderStatus.DRAFT, operation)

    private fun requireStatus(expected: OrderStatus, operation: String) {
        if (status != expected) throw IllegalOrderTransitionException(status, operation)
    }

    companion object {
        fun create(
            id: OrderId,
            customerId: CustomerId,
            currency: Currency,
            eventId: EventId,
            occurredAt: Instant,
        ): Order = Order(
            id = id,
            customerId = customerId,
            currency = currency,
            status = OrderStatus.DRAFT,
            lines = emptyList(),
            version = 0,
        ).also { order ->
            order.raise(OrderCreated(eventId, occurredAt, id, customerId, currency))
        }

        fun create(
            id: OrderId,
            customerId: CustomerId,
            currency: Currency,
            eventIds: IdGenerator<EventId>,
            clock: Clock,
        ): Order = create(id, customerId, currency, eventIds.nextId(), clock.now())

        internal fun reconstitute(
            id: OrderId,
            customerId: CustomerId,
            currency: Currency,
            status: OrderStatus,
            lines: List<OrderLine>,
            version: Long,
        ): Order = Order(id, customerId, currency, status, lines, version)
    }
}
