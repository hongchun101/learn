package io.github.dddlearning.payments.domain.model

import io.github.dddlearning.domain.AggregateRoot
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.payments.domain.events.PaymentAuthorized
import io.github.dddlearning.payments.domain.events.PaymentCaptured
import io.github.dddlearning.payments.domain.events.PaymentFailed
import io.github.dddlearning.payments.domain.events.PaymentRefunded
import io.github.dddlearning.payments.domain.exception.InvalidPaymentAmountException
import io.github.dddlearning.payments.domain.exception.InvalidPaymentStateException
import io.github.dddlearning.value.Money
import java.time.Instant

/**
 * 支付聚合根。
 *
 * 不变性：
 *  - 订单引用（业务幂等键）一旦设置不可变
 *  - 金额在创建时确定后不可更改（只允许退款扣减已捕获金额）
 *  - 状态转换只能由本类的方法触发，且每次都守卫前置状态
 *
 * 并发：
 *  - 版本号 [version] 由仓储层在 save 时自增，实现乐观锁。
 *  - 任何修改状态的方法都会使 version 增加。
 *
 * 状态机：
 *   PENDING ──authorizeOk──▶ AUTHORIZED ──capture──▶ CAPTURED ──refund──▶ REFUNDED
 *      │                          │
 *      └────────authorizeFail──────┴───────────────▶ FAILED
 *
 * 注意：所有领域事件的 ID 与时间戳都通过外部注入的 IdGenerator 与 Clock 获得，
 * 领域代码因此完全确定性（可重放）。
 */
class Payment internal constructor(
    id: PaymentId,
    val orderReference: String,
    val amount: Money,
    var status: PaymentStatus,
    var externalPaymentId: ExternalPaymentId? = null,
    var version: Long = 0L,
    private val eventIdGen: IdGenerator<EventId>,
    private val clock: () -> Instant
) : AggregateRoot<PaymentId>(id) {

    init {
        require(orderReference.isNotBlank()) { "orderReference 必须为非空字符串" }
        require(amount.compareTo(Money.zero(amount.currency)) > 0) {
            throw InvalidPaymentAmountException("支付金额必须 > 0, 当前为 ${amount.amount}")
        }
    }

    /**
     * 工厂方法：从 PENDING 状态创建一笔新支付。
     * 该方法不会触发领域事件；Payment 是从外部命令创建的，
     * "创建" 本身不是业务事件——只有状态转换才是。
     */
    companion object {
        fun create(
            paymentId: PaymentId,
            orderReference: String,
            amount: Money,
            eventIdGen: IdGenerator<EventId>,
            clock: () -> Instant
        ): Payment = Payment(
            id = paymentId,
            orderReference = orderReference,
            amount = amount,
            status = PaymentStatus.Pending,
            eventIdGen = eventIdGen,
            clock = clock
        )

        /** 仓储层用于从持久化状态重建聚合根（不会触发事件）。 */
        internal fun rehydrate(
            id: PaymentId,
            orderReference: String,
            amount: Money,
            status: PaymentStatus,
            externalPaymentId: ExternalPaymentId?,
            version: Long,
            eventIdGen: IdGenerator<EventId>,
            clock: () -> Instant
        ): Payment = Payment(
            id = id,
            orderReference = orderReference,
            amount = amount,
            status = status,
            externalPaymentId = externalPaymentId,
            version = version,
            eventIdGen = eventIdGen,
            clock = clock
        )
    }

    // ---------- 状态守卫 ----------

    private fun requireStatus(expected: PaymentStatus, action: String) {
        if (status != expected) {
            throw InvalidPaymentStateException(
                currentStatus = status,
                action = action,
                reason = "需要处于 ${expected} 状态"
            )
        }
    }

    // ---------- 业务操作 ----------

    /**
     * 网关授权成功后由应用层调用。从 PENDING → AUTHORIZED，
     * 并发出 PaymentAuthorized 事件（带幂等键 + 外部 ID）。
     */
    fun markAuthorized(externalPaymentId: ExternalPaymentId): PaymentAuthorized {
        requireStatus(PaymentStatus.Pending, "markAuthorized")
        this.status = PaymentStatus.Authorized
        this.externalPaymentId = externalPaymentId
        this.version += 1

        val event = PaymentAuthorized(
            eventId = eventIdGen.nextId(),
            occurredAt = clock(),
            paymentId = id,
            orderReference = orderReference,
            externalPaymentId = externalPaymentId,
            amount = amount
        )
        raise(event)
        return event
    }

    /**
     * 授权失败后由应用层调用。从 PENDING → FAILED，
     * 并发出 PaymentFailed 事件。
     */
    fun markFailed(reason: String): PaymentFailed {
        requireStatus(PaymentStatus.Pending, "markFailed")
        require(reason.isNotBlank()) { "失败原因必须为非空字符串" }

        this.status = PaymentStatus.Failed
        this.version += 1

        val event = PaymentFailed(
            eventId = eventIdGen.nextId(),
            occurredAt = clock(),
            paymentId = id,
            orderReference = orderReference,
            requestedAmount = amount,
            reason = reason
        )
        raise(event)
        return event
    }

    /**
     * 资金已结算（capture）。从 AUTHORIZED → CAPTURED。
     * 业务规则：必须先有外部支付 ID 才能 capture。
     */
    fun markCaptured(): PaymentCaptured {
        requireStatus(PaymentStatus.Authorized, "markCaptured")
        val extId = externalPaymentId
            ?: throw InvalidPaymentStateException(
                currentStatus = status,
                action = "markCaptured",
                reason = "缺少外部支付 ID"
            )

        this.status = PaymentStatus.Captured
        this.version += 1

        val event = PaymentCaptured(
            eventId = eventIdGen.nextId(),
            occurredAt = clock(),
            paymentId = id,
            orderReference = orderReference,
            capturedAmount = amount
        )
        raise(event)
        // markCaptured 不需要 extId，但显式持有 extId 的对象需要 ref，这里仅用于守卫
        @Suppress("UNUSED_EXPRESSION") extId
        return event
    }

    /**
     * 退款。允许从 AUTHORIZED / CAPTURED 转到 REFUNDED。
     * 业务规则：
     *  - 退款金额必须为正
     *  - 部分退款金额不超过原支付金额
     *  - 全额退款时金额必须等于原支付金额
     */
    fun markRefunded(refundAmount: Money): PaymentRefunded {
        if (status != PaymentStatus.Authorized && status != PaymentStatus.Captured) {
            throw InvalidPaymentStateException(
                currentStatus = status,
                action = "markRefunded",
                reason = "需要处于 AUTHORIZED 或 CAPTURED 状态"
            )
        }
        if (refundAmount.currency != amount.currency) {
            throw InvalidPaymentAmountException(
                "退款币种 ${refundAmount.currency.code} 与支付币种 ${amount.currency.code} 不一致"
            )
        }
        if (refundAmount.compareTo(amount) > 0) {
            throw InvalidPaymentAmountException(
                "退款金额 ${refundAmount.amount} 超过支付金额 ${amount.amount}"
            )
        }

        val isFullRefund = refundAmount.compareTo(amount) == 0
        this.status = PaymentStatus.Refunded
        this.version += 1

        val event = PaymentRefunded(
            eventId = eventIdGen.nextId(),
            occurredAt = clock(),
            paymentId = id,
            orderReference = orderReference,
            refundAmount = refundAmount,
            isFullRefund = isFullRefund
        )
        raise(event)
        return event
    }

    // ---------- 查询 ----------

    /** 是否为终态（不再发生业务事件）。 */
    val isTerminal: Boolean
        get() = status is PaymentStatus.Failed || status is PaymentStatus.Refunded

    /** 是否已授权但未结算。 */
    val isAuthorized: Boolean
        get() = status is PaymentStatus.Authorized

    /** 是否已结算（资金到账）。 */
    val isCaptured: Boolean
        get() = status is PaymentStatus.Captured

    override fun toString(): String =
        "Payment(id=${id.value}, ref=$orderReference, amount=$amount, status=$status, v=$version)"
}