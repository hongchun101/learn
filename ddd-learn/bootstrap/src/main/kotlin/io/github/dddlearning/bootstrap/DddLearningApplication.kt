package io.github.dddlearning.bootstrap

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.inmemory.InMemoryOutbox
import io.github.dddlearning.integration.InProcessTypedEventBus
import io.github.dddlearning.inventory.application.CommitStockReservationHandler
import io.github.dddlearning.inventory.application.ReleaseStockReservationHandler
import io.github.dddlearning.inventory.application.ReplenishStock
import io.github.dddlearning.inventory.application.ReplenishStockHandler
import io.github.dddlearning.inventory.application.ReserveStockHandler
import io.github.dddlearning.inventory.domain.Sku
import io.github.dddlearning.inventory.domain.WarehouseId
import io.github.dddlearning.inventory.infrastructure.InMemoryStockItemRepository
import io.github.dddlearning.ordering.application.AddOrderLineCommand
import io.github.dddlearning.ordering.application.AddOrderLineHandler
import io.github.dddlearning.ordering.application.ConfirmOrderHandler
import io.github.dddlearning.ordering.application.CreateOrderCommand
import io.github.dddlearning.ordering.application.CreateOrderHandler
import io.github.dddlearning.ordering.application.RejectOrderHandler
import io.github.dddlearning.ordering.application.SubmitOrderCommand
import io.github.dddlearning.ordering.application.SubmitOrderHandler
import io.github.dddlearning.ordering.domain.CustomerId
import io.github.dddlearning.ordering.domain.InMemoryOrderRepository
import io.github.dddlearning.ordering.domain.OrderId
import io.github.dddlearning.ordering.domain.OrderLineId
import io.github.dddlearning.ordering.domain.OrderStatus
import io.github.dddlearning.ordering.domain.ProductId
import io.github.dddlearning.ordering.domain.Quantity
import io.github.dddlearning.payments.application.AuthorizePaymentHandler
import io.github.dddlearning.payments.infrastructure.gateway.DeterministicFakePaymentGateway
import io.github.dddlearning.payments.infrastructure.persistence.InMemoryPaymentRepository
import io.github.dddlearning.port.Clock
import io.github.dddlearning.port.DomainEventPublisher
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import java.math.BigDecimal
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

class SequentialIdGenerator<T>(
    private val prefix: String,
    private val factory: (String) -> T,
) : IdGenerator<T> {
    private val sequence = AtomicLong()
    override fun nextId(): T = factory("$prefix-${sequence.incrementAndGet()}")
}

class MutableClock(initial: Instant) : Clock {
    private var current = initial
    override fun now(): Instant = current
    fun advanceSeconds(seconds: Long) {
        current = current.plusSeconds(seconds)
    }
}

data class DemoResult(
    val process: CheckoutProcess,
    val orderStatus: OrderStatus,
    val availableStock: Int,
    val reservedStock: Int,
    val paymentCount: Int,
    val gatewayCalls: Long,
)

/** Composition root: the only place concrete adapters and bounded contexts are wired together. */
class DddLearningLab private constructor(
    val ordering: InMemoryOrderRepository,
    val inventory: InMemoryStockItemRepository,
    val payments: InMemoryPaymentRepository,
    val gateway: DeterministicFakePaymentGateway,
    val processRepository: InMemoryCheckoutProcessRepository,
    val checkout: CheckoutProcessManager,
    private val createOrder: CreateOrderHandler,
    private val addLine: AddOrderLineHandler,
    private val submitOrder: SubmitOrderHandler,
    private val replenishStock: ReplenishStockHandler,
    private val warehouseId: WarehouseId,
) {
    fun runScenario(
        reference: String,
        stockQuantity: Int,
        orderQuantity: Int,
        unitPrice: Money,
    ): DemoResult {
        val sku = Sku("DDD-BOOK")
        replenishStock.handle(ReplenishStock(sku, warehouseId, stockQuantity))
        val orderId = createOrder.handle(CreateOrderCommand(CustomerId("student-$reference"), unitPrice.currency))
        addLine.handle(
            AddOrderLineCommand(
                orderId = orderId,
                productId = ProductId(sku.value),
                productName = "《领域驱动设计》",
                unitPrice = unitPrice,
                quantity = Quantity(orderQuantity),
            ),
        )
        submitOrder.handle(SubmitOrderCommand(orderId))
        val submitted = requireNotNull(ordering.findById(orderId))
        val process = checkout.checkout(
            SubmittedOrder(
                orderId = orderId.value,
                lines = submitted.lines.map {
                    SubmittedOrderLine(it.id.value, it.productId.value, it.quantity.value)
                },
                total = submitted.total,
            ),
        )
        val stock = requireNotNull(inventory.findById(io.github.dddlearning.inventory.domain.StockItemId(sku, warehouseId)))
        return DemoResult(
            process = process,
            orderStatus = requireNotNull(ordering.findById(orderId)).status,
            availableStock = stock.available,
            reservedStock = stock.reserved,
            paymentCount = payments.size(),
            gatewayCalls = gateway.authorizeCallCount(),
        )
    }

    companion object {
        fun create(
            paymentBehavior: DeterministicFakePaymentGateway.Behavior =
                DeterministicFakePaymentGateway.Behavior.ApproveAll,
            idNamespace: String = "demo",
        ): DddLearningLab {
            val clock = MutableClock(Instant.parse("2026-01-01T00:00:00Z"))
            val eventIds = SequentialIdGenerator("$idNamespace-event", ::EventId)
            val orderIds = SequentialIdGenerator("$idNamespace-order", ::OrderId)
            val lineIds = SequentialIdGenerator("$idNamespace-line", ::OrderLineId)
            val bus = InProcessTypedEventBus()
            val ordering = InMemoryOrderRepository()
            val inventory = InMemoryStockItemRepository()
            val payments = InMemoryPaymentRepository(eventIds, java.time.Clock.fixed(clock.now(), java.time.ZoneOffset.UTC))
            val gateway = DeterministicFakePaymentGateway(paymentBehavior)
            val outbox = InMemoryOutbox()
            val warehouse = WarehouseId("CN-SH-1")

            val publisher: DomainEventPublisher = object : DomainEventPublisher {
                override fun publish(event: DomainEvent) = bus.publish(event)
            }
            val createOrder = CreateOrderHandler(ordering, orderIds, eventIds, clock, publisher)
            val addLine = AddOrderLineHandler(ordering, lineIds)
            val submit = SubmitOrderHandler(ordering, eventIds, clock, publisher)
            val confirm = ConfirmOrderHandler(ordering, eventIds, clock, publisher)
            val reject = RejectOrderHandler(ordering, eventIds, clock, publisher)
            val replenish = ReplenishStockHandler(inventory, eventIds, clock, publisher)
            val reserve = ReserveStockHandler(inventory, eventIds, clock, publisher)
            val release = ReleaseStockReservationHandler(inventory, eventIds, clock, publisher)
            val commit = CommitStockReservationHandler(inventory, eventIds, clock, publisher)
            val authorize = AuthorizePaymentHandler(payments, gateway, publisher, outbox, eventIds, clock)
            val processRepository = InMemoryCheckoutProcessRepository()
            val checkout = CheckoutProcessManager(
                processRepository,
                reserve,
                release,
                commit,
                authorize,
                payments,
                confirm,
                reject,
                warehouse,
            )
            return DddLearningLab(
                ordering,
                inventory,
                payments,
                gateway,
                processRepository,
                checkout,
                createOrder,
                addLine,
                submit,
                replenish,
                warehouse,
            )
        }
    }
}

fun main() {
    println("=== Kotlin DDD 学习实验室：跨上下文 Saga ===")

    val success = DddLearningLab.create(idNamespace = "success").runScenario(
        reference = "SUCCESS",
        stockQuantity = 10,
        orderQuantity = 2,
        unitPrice = Money.of(Currency.CNY, BigDecimal("88.00")),
    )
    println("成功场景: Saga=${success.process.status}, 订单=${success.orderStatus}, 可用库存=${success.availableStock}, 支付次数=${success.gatewayCalls}")

    val rejected = DddLearningLab.create(
        paymentBehavior = DeterministicFakePaymentGateway.Behavior.RejectAll,
        idNamespace = "rejected",
    ).runScenario(
        reference = "REJECTED",
        stockQuantity = 10,
        orderQuantity = 2,
        unitPrice = Money.of(Currency.CNY, BigDecimal("88.00")),
    )
    println("支付拒绝场景: Saga=${rejected.process.status}, 订单=${rejected.orderStatus}, 已补偿预留=${rejected.reservedStock == 0}, 可用库存=${rejected.availableStock}")
    println("提示：阅读 README.md，按 L0 → L8 完成练习与毕业作品。")
}
