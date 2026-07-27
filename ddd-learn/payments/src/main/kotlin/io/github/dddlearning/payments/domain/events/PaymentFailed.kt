package io.github.dddlearning.payments.domain.events

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.value.Money
import java.time.Instant

/**
 * 支付授权失败。失败原因由 reason 描述（INSUFFICIENT_FUNDS / DECLINED / GATEWAY_ERROR / INVALID_REQUEST）。
 */
data class PaymentFailed(
    override val eventId: EventId,
    override val occurredAt: Instant,
    val paymentId: PaymentId,
    val orderReference: String,
    val requestedAmount: Money,
    val reason: String
) : DomainEvent {
    init {
        require(orderReference.isNotBlank()) { "orderReference 必须为非空字符串" }
        require(reason.isNotBlank()) { "失败原因必须为非空字符串" }
    }
}