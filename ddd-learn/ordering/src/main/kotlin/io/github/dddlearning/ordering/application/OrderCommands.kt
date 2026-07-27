package io.github.dddlearning.ordering.application

import io.github.dddlearning.application.CommandHandler
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.ordering.domain.CustomerId
import io.github.dddlearning.ordering.domain.Order
import io.github.dddlearning.ordering.domain.OrderId
import io.github.dddlearning.ordering.domain.OrderLine
import io.github.dddlearning.ordering.domain.OrderLineId
import io.github.dddlearning.ordering.domain.OrderNotFoundException
import io.github.dddlearning.ordering.domain.OrderRepository
import io.github.dddlearning.ordering.domain.ProductId
import io.github.dddlearning.ordering.domain.Quantity
import io.github.dddlearning.port.Clock
import io.github.dddlearning.port.DomainEventPublisher
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money

private fun OrderRepository.required(id: OrderId): Order = findById(id) ?: throw OrderNotFoundException(id)

private fun persistAndPublish(
    order: Order,
    expectedVersion: Long,
    repository: OrderRepository,
    publisher: DomainEventPublisher,
) {
    repository.save(order, expectedVersion)
    publisher.publishAll(order.pullDomainEvents())
}

data class CreateOrderCommand(val customerId: CustomerId, val currency: Currency)
data class AddOrderLineCommand(
    val orderId: OrderId,
    val productId: ProductId,
    val productName: String,
    val unitPrice: Money,
    val quantity: Quantity,
)
data class ChangeOrderLineQuantityCommand(val orderId: OrderId, val lineId: OrderLineId, val quantity: Quantity)
data class RemoveOrderLineCommand(val orderId: OrderId, val lineId: OrderLineId)
data class SubmitOrderCommand(val orderId: OrderId)
data class ConfirmOrderCommand(val orderId: OrderId)
data class RejectOrderCommand(val orderId: OrderId, val reason: String)
data class CancelOrderCommand(val orderId: OrderId)

class CreateOrderHandler(
    private val repository: OrderRepository,
    private val orderIds: IdGenerator<OrderId>,
    private val eventIds: IdGenerator<EventId>,
    private val clock: Clock,
    private val publisher: DomainEventPublisher,
) : CommandHandler<CreateOrderCommand, OrderId> {
    override fun handle(command: CreateOrderCommand): OrderId {
        val id = orderIds.nextId()
        val order = Order.create(id, command.customerId, command.currency, eventIds.nextId(), clock.now())
        persistAndPublish(order, 0, repository, publisher)
        return id
    }
}

class AddOrderLineHandler(
    private val repository: OrderRepository,
    private val lineIds: IdGenerator<OrderLineId>,
) : CommandHandler<AddOrderLineCommand, OrderId> {
    override fun handle(command: AddOrderLineCommand): OrderId {
        val order = repository.required(command.orderId)
        val expectedVersion = order.version
        order.addLine(OrderLine(lineIds.nextId(), command.productId, command.productName, command.unitPrice, command.quantity))
        repository.save(order, expectedVersion)
        return order.id
    }
}

class ChangeOrderLineQuantityHandler(private val repository: OrderRepository) : CommandHandler<ChangeOrderLineQuantityCommand, OrderId> {
    override fun handle(command: ChangeOrderLineQuantityCommand): OrderId {
        val order = repository.required(command.orderId)
        val expectedVersion = order.version
        order.changeQuantity(command.lineId, command.quantity)
        repository.save(order, expectedVersion)
        return order.id
    }
}

class RemoveOrderLineHandler(private val repository: OrderRepository) : CommandHandler<RemoveOrderLineCommand, OrderId> {
    override fun handle(command: RemoveOrderLineCommand): OrderId {
        val order = repository.required(command.orderId)
        val expectedVersion = order.version
        order.removeLine(command.lineId)
        repository.save(order, expectedVersion)
        return order.id
    }
}

abstract class EventfulOrderHandler<C : Any>(
    private val repository: OrderRepository,
    private val eventIds: IdGenerator<EventId>,
    private val clock: Clock,
    private val publisher: DomainEventPublisher,
) : CommandHandler<C, OrderId> {
    protected fun change(id: OrderId, transition: Order.(EventId, java.time.Instant) -> Unit): OrderId {
        val order = repository.required(id)
        val expectedVersion = order.version
        order.transition(eventIds.nextId(), clock.now())
        persistAndPublish(order, expectedVersion, repository, publisher)
        return id
    }
}

class SubmitOrderHandler(repository: OrderRepository, eventIds: IdGenerator<EventId>, clock: Clock, publisher: DomainEventPublisher) :
    EventfulOrderHandler<SubmitOrderCommand>(repository, eventIds, clock, publisher) {
    override fun handle(command: SubmitOrderCommand): OrderId = change(command.orderId, Order::submit)
}

class ConfirmOrderHandler(repository: OrderRepository, eventIds: IdGenerator<EventId>, clock: Clock, publisher: DomainEventPublisher) :
    EventfulOrderHandler<ConfirmOrderCommand>(repository, eventIds, clock, publisher) {
    override fun handle(command: ConfirmOrderCommand): OrderId = change(command.orderId, Order::confirm)
}

class RejectOrderHandler(repository: OrderRepository, eventIds: IdGenerator<EventId>, clock: Clock, publisher: DomainEventPublisher) :
    EventfulOrderHandler<RejectOrderCommand>(repository, eventIds, clock, publisher) {
    override fun handle(command: RejectOrderCommand): OrderId =
        change(command.orderId) { eventId, at -> reject(command.reason, eventId, at) }
}

class CancelOrderHandler(repository: OrderRepository, eventIds: IdGenerator<EventId>, clock: Clock, publisher: DomainEventPublisher) :
    EventfulOrderHandler<CancelOrderCommand>(repository, eventIds, clock, publisher) {
    override fun handle(command: CancelOrderCommand): OrderId = change(command.orderId, Order::cancel)
}
