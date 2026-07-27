package io.github.dddlearning.payments.domain.events

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.value.Money
import java.time.Instant

/**
 * 支付已退款（全额或部分）。只有 AUTHORIZED / CAPTURED 状态可以触发退款。
 */
data class PaymentRefunded(
    override val eventId: EventId,
    override val occurredAt: Instant,
    val paymentId: PaymentId,
    val orderReference: String,
    val refundAmount: Money,
    val isFullRefund: Boolean
) : DomainEvent {
    init {
        require(orderReference.isNotBlank()) { "orderReference 必须为非空字符串" }
        require(refundAmount.compareTo(Money.zero(refundAmount.currency)) > 0) { "退款金额必须 > 0" }
    }
}