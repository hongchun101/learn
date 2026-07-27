package io.github.dddlearning.payments.domain.events

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.payments.domain.model.ExternalPaymentId
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.value.Money
import java.time.Instant

/**
 * 支付网关已授权资金。事件携带支付标识符、订单业务键（幂等键）、
 * 外部网关标识符（用于后续 capture / refund）和授权金额。
 *
 * 业务约束：
 *  - amount 必须 > 0
 *  - orderReference 不为空，用于消费方做去重 / 对账
 */
data class PaymentAuthorized(
    override val eventId: EventId,
    override val occurredAt: Instant,
    val paymentId: PaymentId,
    val orderReference: String,
    val externalPaymentId: ExternalPaymentId,
    val amount: Money
) : DomainEvent {
    init {
        require(orderReference.isNotBlank()) { "orderReference 必须为非空字符串" }
        require(amount.compareTo(Money.zero(amount.currency)) > 0) { "授权金额必须 > 0" }
    }
}