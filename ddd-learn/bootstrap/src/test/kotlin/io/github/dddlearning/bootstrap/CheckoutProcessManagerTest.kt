package io.github.dddlearning.bootstrap

import io.github.dddlearning.bootstrap.CheckoutProcessManager
import io.github.dddlearning.bootstrap.InMemoryCheckoutProcessRepository
import io.github.dddlearning.bootstrap.SubmittedOrder
import io.github.dddlearning.bootstrap.SubmittedOrderLine
import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.inmemory.InMemoryOutbox
import io.github.dddlearning.inventory.application.CommitStockReservationHandler
import io.github.dddlearning.inventory.application.ReleaseStockReservationHandler
import io.github.dddlearning.inventory.application.ReplenishStock
import io.github.dddlearning.inventory.application.ReplenishStockHandler
import io.github.dddlearning.inventory.application.ReserveStockHandler
import io.github.dddlearning.inventory.domain.ReservationStatus
import io.github.dddlearning.inventory.domain.Sku
import io.github.dddlearning.inventory.domain.StockItemId
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
import io.github.dddlearning.payments.domain.model.PaymentStatus
import io.github.dddlearning.payments.domain.repository.GatewayDeclineReason
import io.github.dddlearning.payments.domain.repository.PaymentRepository
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
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class CheckoutProcessManagerTest {

    private val initialInstant: Instant = Instant.parse("2026-07-25T00:00:00Z")

    @Test
    fun `successful checkout reserves stock authorizes payment confirms order and commits stock`() {
        val harness = TestHarness(gatewayBehavior = DeterministicFakePaymentGateway.Behavior.ApproveAll)

        harness.replenish(Sku("SKU-BOOK"), 5)
        val submittedOrder = harness.createSubmittedOrder(
            orderReference = "order-success",
            sku = "SKU-BOOK",
            quantity = 2,
            unitPrice = Money.of(Currency.CNY, BigDecimal("88.00")),
        )

        val process = harness.manager.checkout(submittedOrder)

        assertEquals(CheckoutStatus.COMPLETED, process.status)
        assertEquals(OrderStatus.CONFIRMED, harness.ordering.findById(OrderId(submittedOrder.orderId))?.status)
        assertNotNull(process.paymentId)

        val stockId = StockItemId(Sku("SKU-BOOK"), harness.warehouse)
        val stock = requireNotNull(harness.inventory.findById(stockId))
        // 提交成功后：在库 5 - 预留 2 = 3；预留计数为 0（已被 commit 消化）
        assertEquals(3, stock.onHand)
        assertEquals(0, stock.reserved)
        assertEquals(3, stock.available)

        val payments = harness.payments.findAll()
        assertEquals(1, payments.size)
        assertEquals(PaymentStatus.Authorized, payments.single().status)
        assertEquals(1, harness.gateway.authorizeCallCount())
    }

    @Test
    fun `insufficient stock fails the process rejects the order and leaves available stock untouched`() {
        val harness = TestHarness(gatewayBehavior = DeterministicFakePaymentGateway.Behavior.ApproveAll)

        harness.replenish(Sku("SKU-BOOK"), 1)
        val submittedOrder = harness.createSubmittedOrder(
            orderReference = "order-no-stock",
            sku = "SKU-BOOK",
            quantity = 3,
            unitPrice = Money.of(Currency.CNY, BigDecimal("88.00")),
        )

        val process = harness.manager.checkout(submittedOrder)

        assertEquals(CheckoutStatus.FAILED, process.status)
        assertTrue(process.failureReason?.contains("库存预留失败") == true)

        val order = requireNotNull(harness.ordering.findById(OrderId(submittedOrder.orderId)))
        assertEquals(OrderStatus.REJECTED, order.status)

        // 库存预留失败时，第一行预留已被持久化但立即释放；最终在库/预留应回到原状
        val stock = requireNotNull(harness.inventory.findById(StockItemId(Sku("SKU-BOOK"), harness.warehouse)))
        assertEquals(1, stock.onHand)
        assertEquals(0, stock.reserved)
        assertEquals(1, stock.available)

        // 网关从未被调用：支付上下文保持清洁
        assertEquals(0, harness.gateway.authorizeCallCount())
        assertEquals(0, harness.payments.size())
    }

    @Test
    fun `payment rejection releases reservations and rejects the order`() {
        val harness = TestHarness(
            gatewayBehavior = DeterministicFakePaymentGateway.Behavior.RejectReason(GatewayDeclineReason.DECLINED),
        )

        harness.replenish(Sku("SKU-BOOK"), 5)
        val submittedOrder = harness.createSubmittedOrder(
            orderReference = "order-declined",
            sku = "SKU-BOOK",
            quantity = 2,
            unitPrice = Money.of(Currency.CNY, BigDecimal("88.00")),
        )

        val process = harness.manager.checkout(submittedOrder)

        assertEquals(CheckoutStatus.FAILED, process.status)
        assertEquals("支付授权失败", process.failureReason)

        val order = requireNotNull(harness.ordering.findById(OrderId(submittedOrder.orderId)))
        assertEquals(OrderStatus.REJECTED, order.status)

        // 预留必须被释放：库存回到全额可用
        val stock = requireNotNull(harness.inventory.findById(StockItemId(Sku("SKU-BOOK"), harness.warehouse)))
        assertEquals(5, stock.onHand)
        assertEquals(0, stock.reserved)
        assertEquals(5, stock.available)
        assertEquals(ReservationStatus.RELEASED, stock.reservations.values.single().status)

        // 支付被记录为 FAILED 终态
        val payments = harness.payments.findAll()
        assertEquals(1, payments.size)
        assertEquals(PaymentStatus.Failed, payments.single().status)
        assertEquals(1, harness.gateway.authorizeCallCount())
    }

    @Test
    fun `duplicate checkout does not duplicate charge or reservation`() {
        val harness = TestHarness(gatewayBehavior = DeterministicFakePaymentGateway.Behavior.ApproveAll)

        harness.replenish(Sku("SKU-BOOK"), 5)
        val submittedOrder = harness.createSubmittedOrder(
            orderReference = "order-replay",
            sku = "SKU-BOOK",
            quantity = 2,
            unitPrice = Money.of(Currency.CNY, BigDecimal("88.00")),
        )

        val first = harness.manager.checkout(submittedOrder)
        val second = harness.manager.checkout(submittedOrder)

        assertEquals(CheckoutStatus.COMPLETED, first.status)
        assertEquals(CheckoutStatus.COMPLETED, second.status)
        assertEquals(first, second)

        // 网关仍只被调用一次 —— 业务幂等键在支付层生效
        assertEquals(1, harness.gateway.authorizeCallCount())
        // 支付仓储中只有一笔支付
        assertEquals(1, harness.payments.size())
        // 库存净结果仍然是 commit 之后的 3 件可用
        val stock = requireNotNull(harness.inventory.findById(StockItemId(Sku("SKU-BOOK"), harness.warehouse)))
        assertEquals(3, stock.onHand)
        assertEquals(0, stock.reserved)
    }

    @Test
    fun `failed checkout replay still returns FAILED without recharging`() {
        val harness = TestHarness(
            gatewayBehavior = DeterministicFakePaymentGateway.Behavior.RejectReason(GatewayDeclineReason.INSUFFICIENT_FUNDS),
        )

        harness.replenish(Sku("SKU-BOOK"), 5)
        val submittedOrder = harness.createSubmittedOrder(
            orderReference = "order-failed-replay",
            sku = "SKU-BOOK",
            quantity = 1,
            unitPrice = Money.of(Currency.CNY, BigDecimal("50.00")),
        )

        val first = harness.manager.checkout(submittedOrder)
        val second = harness.manager.checkout(submittedOrder)

        assertEquals(CheckoutStatus.FAILED, first.status)
        assertEquals(CheckoutStatus.FAILED, second.status)

        // 第二次不重复扣款：网关仍只调用一次
        assertEquals(1, harness.gateway.authorizeCallCount())
        // 仓储仍只有一笔失败的支付
        assertEquals(1, harness.payments.size())
        assertEquals(PaymentStatus.Failed, harness.payments.findAll().single().status)
    }

    /**
     * Test harness：与 DddLearningLab.create 等价的最小装配，但保留所有依赖为 public，
     * 便于断言；使用确定性 ID 与时钟，避免依赖环境时间。
     */
    private class TestHarness(
        gatewayBehavior: DeterministicFakePaymentGateway.Behavior,
    ) {
        private val clock: Clock = object : Clock {
            private var current: Instant = Instant.parse("2026-07-25T00:00:00Z")
            override fun now(): Instant = current
        }
        private val eventIds = SequentialIdGenerator("test-event", ::EventId)
        private val orderIds = SequentialIdGenerator("test-order", ::OrderId)
        private val lineIds = SequentialIdGenerator("test-line", ::OrderLineId)

        val ordering: InMemoryOrderRepository = InMemoryOrderRepository()
        val inventory: InMemoryStockItemRepository = InMemoryStockItemRepository()
        val payments: InMemoryPaymentRepository = InMemoryPaymentRepository()
        val gateway: DeterministicFakePaymentGateway = DeterministicFakePaymentGateway(gatewayBehavior)
        val processRepository: InMemoryCheckoutProcessRepository = InMemoryCheckoutProcessRepository()
        val warehouse: WarehouseId = WarehouseId("TEST-WH")

        private val outbox: InMemoryOutbox = InMemoryOutbox()
        private val published = mutableListOf<DomainEvent>()

        private val publisher: DomainEventPublisher = object : DomainEventPublisher {
            override fun publish(event: DomainEvent) { published += event }
            override fun publishAll(events: Iterable<DomainEvent>) { published += events }
        }

        private val replenishHandler = ReplenishStockHandler(inventory, eventIds, clock, publisher)
        private val reserveHandler = ReserveStockHandler(inventory, eventIds, clock, publisher)
        private val releaseHandler = ReleaseStockReservationHandler(inventory, eventIds, clock, publisher)
        private val commitHandler = CommitStockReservationHandler(inventory, eventIds, clock, publisher)
        private val createOrderHandler = CreateOrderHandler(ordering, orderIds, eventIds, clock, publisher)
        private val addLineHandler = AddOrderLineHandler(ordering, lineIds)
        private val submitHandler = SubmitOrderHandler(ordering, eventIds, clock, publisher)
        private val confirmHandler = ConfirmOrderHandler(ordering, eventIds, clock, publisher)
        private val rejectHandler = RejectOrderHandler(ordering, eventIds, clock, publisher)
        private val authorizeHandler = AuthorizePaymentHandler(
            paymentRepository = payments,
            paymentGateway = gateway,
            eventPublisher = publisher,
            outbox = outbox,
            eventIdGen = eventIds,
            clock = clock,
        )

        val manager: CheckoutProcessManager = CheckoutProcessManager(
            processes = processRepository,
            reserveStock = reserveHandler,
            releaseStock = releaseHandler,
            commitStock = commitHandler,
            authorizePayment = authorizeHandler,
            payments = payments,
            confirmOrder = confirmHandler,
            rejectOrder = rejectHandler,
            warehouseId = warehouse,
        )

        fun replenish(sku: Sku, quantity: Int) {
            replenishHandler.handle(ReplenishStock(sku, warehouse, quantity))
        }

        fun createSubmittedOrder(
            orderReference: String,
            sku: String,
            quantity: Int,
            unitPrice: Money,
        ): SubmittedOrder {
            val orderId = createOrderHandler.handle(
                CreateOrderCommand(CustomerId("customer-$orderReference"), unitPrice.currency),
            )
            addLineHandler.handle(
                AddOrderLineCommand(
                    orderId = orderId,
                    productId = ProductId(sku),
                    productName = "测试商品",
                    unitPrice = unitPrice,
                    quantity = Quantity(quantity),
                ),
            )
            submitHandler.handle(SubmitOrderCommand(orderId))
            val stored = requireNotNull(ordering.findById(orderId))
            return SubmittedOrder(
                orderId = orderId.value,
                lines = stored.lines.map {
                    SubmittedOrderLine(
                        lineId = it.id.value,
                        sku = it.productId.value,
                        quantity = it.quantity.value,
                    )
                },
                total = stored.total,
            )
        }
    }

    /**
     * 与生产装配一致的确定性 ID 生成器；独立复制，避免与 production 共用同一计数器。
     */
    private class SequentialIdGenerator<T>(
        private val prefix: String,
        private val factory: (String) -> T,
    ) : IdGenerator<T> {
        private val sequence = AtomicLong()
        override fun nextId(): T = factory("$prefix-${sequence.incrementAndGet()}")
    }
}