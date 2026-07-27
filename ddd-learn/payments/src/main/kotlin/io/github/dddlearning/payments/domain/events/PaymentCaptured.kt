package io.github.dddlearning.payments.domain.events

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.value.Money
import java.time.Instant

/**
 * 资金已结算（capture）成功。授权→capture 的转换由 Payment.markCaptured() 触发。
 */
data class PaymentCaptured(
    override val eventId: EventId,
    override val occurredAt: Instant,
    val paymentId: PaymentId,
    val orderReference: String,
    val capturedAmount: Money
) : DomainEvent {
    init {
        require(orderReference.isNotBlank()) { "orderReference 必须为非空字符串" }
        require(capturedAmount.compareTo(Money.zero(capturedAmount.currency)) > 0) { "结算金额必须 > 0" }
    }
}