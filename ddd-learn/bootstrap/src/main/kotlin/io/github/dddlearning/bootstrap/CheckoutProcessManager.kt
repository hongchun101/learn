package io.github.dddlearning.bootstrap

import io.github.dddlearning.inventory.application.CommitStockReservation
import io.github.dddlearning.inventory.application.CommitStockReservationHandler
import io.github.dddlearning.inventory.application.ReleaseStockReservation
import io.github.dddlearning.inventory.application.ReleaseStockReservationHandler
import io.github.dddlearning.inventory.application.ReserveStock
import io.github.dddlearning.inventory.application.ReserveStockHandler
import io.github.dddlearning.inventory.domain.ReservationId
import io.github.dddlearning.inventory.domain.Sku
import io.github.dddlearning.inventory.domain.WarehouseId
import io.github.dddlearning.ordering.application.ConfirmOrderCommand
import io.github.dddlearning.ordering.application.ConfirmOrderHandler
import io.github.dddlearning.ordering.application.RejectOrderCommand
import io.github.dddlearning.ordering.application.RejectOrderHandler
import io.github.dddlearning.ordering.domain.OrderId
import io.github.dddlearning.payments.application.AuthorizePaymentCommand
import io.github.dddlearning.payments.application.AuthorizePaymentHandler
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.payments.domain.model.PaymentStatus
import io.github.dddlearning.payments.domain.repository.PaymentRepository
import io.github.dddlearning.value.Money

/** Stable integration contract emitted by Ordering's published language. */
data class SubmittedOrder(
    val orderId: String,
    val lines: List<SubmittedOrderLine>,
    val total: Money,
) {
    init {
        require(orderId.isNotBlank()) { "Order id must not be blank" }
        require(lines.isNotEmpty()) { "Submitted order must contain lines" }
    }
}

data class SubmittedOrderLine(
    val lineId: String,
    val sku: String,
    val quantity: Int,
) {
    init {
        require(lineId.isNotBlank()) { "Line id must not be blank" }
        require(sku.isNotBlank()) { "SKU must not be blank" }
        require(quantity > 0) { "Quantity must be positive" }
    }
}

enum class CheckoutStatus {
    STARTED,
    INVENTORY_RESERVED,
    PAYMENT_AUTHORIZED,
    COMPLETED,
    COMPENSATING,
    FAILED,
}

data class ReservedItem(
    val reservationId: ReservationId,
    val sku: Sku,
    val quantity: Int,
)

data class CheckoutProcess(
    val orderId: String,
    val status: CheckoutStatus,
    val reservations: List<ReservedItem> = emptyList(),
    val paymentId: PaymentId? = null,
    val failureReason: String? = null,
    val version: Long = 0,
)

interface CheckoutProcessRepository {
    fun find(orderId: String): CheckoutProcess?
    fun save(process: CheckoutProcess)
}

class InMemoryCheckoutProcessRepository : CheckoutProcessRepository {
    private val processes = LinkedHashMap<String, CheckoutProcess>()

    @Synchronized
    override fun find(orderId: String): CheckoutProcess? = processes[orderId]

    @Synchronized
    override fun save(process: CheckoutProcess) {
        val current = processes[process.orderId]
        require(current == null || current.version + 1 == process.version) {
            "Checkout process ${process.orderId} has stale version ${process.version}"
        }
        processes[process.orderId] = process
    }
}

/**
 * Process manager for the order → inventory → payment workflow.
 *
 * Each step is persisted before the next step starts. Reservation IDs and payment IDs derive from
 * the order ID, making retries business-idempotent. Compensation is a new domain action, not a
 * distributed rollback.
 */
class CheckoutProcessManager(
    private val processes: CheckoutProcessRepository,
    private val reserveStock: ReserveStockHandler,
    private val releaseStock: ReleaseStockReservationHandler,
    private val commitStock: CommitStockReservationHandler,
    private val authorizePayment: AuthorizePaymentHandler,
    private val payments: PaymentRepository,
    private val confirmOrder: ConfirmOrderHandler,
    private val rejectOrder: RejectOrderHandler,
    private val warehouseId: WarehouseId,
) {
    fun checkout(submitted: SubmittedOrder): CheckoutProcess {
        val existing = processes.find(submitted.orderId)
        if (existing?.status == CheckoutStatus.COMPLETED || existing?.status == CheckoutStatus.FAILED) {
            return existing
        }

        var process = existing ?: CheckoutProcess(submitted.orderId, CheckoutStatus.STARTED).also(processes::save)
        if (process.status == CheckoutStatus.STARTED) {
            process = reserveAll(submitted, process)
            if (process.status == CheckoutStatus.FAILED) return process
        }
        if (process.status == CheckoutStatus.INVENTORY_RESERVED) {
            process = authorize(submitted, process)
            if (process.status == CheckoutStatus.FAILED) return process
        }
        if (process.status == CheckoutStatus.PAYMENT_AUTHORIZED) {
            process.reservations.forEach { reserved ->
                commitStock.handle(CommitStockReservation(reserved.reservationId, reserved.sku, warehouseId))
            }
            confirmOrder.handle(ConfirmOrderCommand(OrderId(submitted.orderId)))
            process = process.advance(CheckoutStatus.COMPLETED)
            processes.save(process)
        }
        return process
    }

    private fun reserveAll(submitted: SubmittedOrder, current: CheckoutProcess): CheckoutProcess {
        var checkpoint = current
        val reserved = current.reservations.toMutableList()
        return try {
            submitted.lines.drop(reserved.size).forEach { line ->
                val item = ReservedItem(
                    reservationId = ReservationId("${submitted.orderId}:${line.lineId}"),
                    sku = Sku(line.sku),
                    quantity = line.quantity,
                )
                reserveStock.handle(ReserveStock(item.reservationId, item.sku, warehouseId, item.quantity))
                reserved += item
                checkpoint = checkpoint.copy(
                    reservations = reserved.toList(),
                    version = checkpoint.version + 1,
                )
                processes.save(checkpoint)
            }
            checkpoint.advance(CheckoutStatus.INVENTORY_RESERVED).also(processes::save)
        } catch (failure: RuntimeException) {
            compensateAndReject(submitted.orderId, requireNotNull(processes.find(submitted.orderId)), "库存预留失败: ${failure.message}")
        }
    }

    private fun authorize(submitted: SubmittedOrder, current: CheckoutProcess): CheckoutProcess {
        val paymentId = current.paymentId ?: PaymentId.of("payment-${submitted.orderId}")
        authorizePayment.handle(
            AuthorizePaymentCommand(paymentId, submitted.orderId, submitted.total, "订单 ${submitted.orderId}"),
        )
        val payment = payments.findById(paymentId) ?: payments.findActiveByOrderReference(submitted.orderId)
        return if (payment?.status == PaymentStatus.Authorized) {
            current.copy(
                status = CheckoutStatus.PAYMENT_AUTHORIZED,
                paymentId = payment.id,
                version = current.version + 1,
            ).also(processes::save)
        } else {
            compensateAndReject(submitted.orderId, current, "支付授权失败")
        }
    }

    private fun compensateAndReject(orderId: String, current: CheckoutProcess, reason: String): CheckoutProcess {
        var compensating = current.copy(
            status = CheckoutStatus.COMPENSATING,
            failureReason = reason,
            version = current.version + 1,
        )
        processes.save(compensating)
        compensating.reservations.forEach { reserved ->
            releaseStock.handle(ReleaseStockReservation(reserved.reservationId, reserved.sku, warehouseId))
        }
        rejectOrder.handle(RejectOrderCommand(OrderId(orderId), reason))
        compensating = compensating.advance(CheckoutStatus.FAILED)
        processes.save(compensating)
        return compensating
    }

    private fun CheckoutProcess.advance(next: CheckoutStatus): CheckoutProcess =
        copy(status = next, version = version + 1)
}
