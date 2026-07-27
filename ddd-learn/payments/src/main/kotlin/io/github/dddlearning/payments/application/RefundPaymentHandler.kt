package io.github.dddlearning.payments.application

import io.github.dddlearning.application.CommandHandler
import io.github.dddlearning.port.DomainEventPublisher
import io.github.dddlearning.messaging.EventEnvelope
import io.github.dddlearning.messaging.Outbox
import io.github.dddlearning.payments.domain.exception.InvalidPaymentStateException
import io.github.dddlearning.payments.domain.model.Payment
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.payments.domain.model.PaymentStatus
import io.github.dddlearning.payments.domain.repository.PaymentGateway
import io.github.dddlearning.payments.domain.repository.PaymentRepository
import io.github.dddlearning.value.Money

/**
 * 退款命令。对 AUTHORIZED / CAPTURED 状态的支付进行全额或部分退款。
 */
data class RefundPaymentCommand(
    val paymentId: PaymentId,
    val refundAmount: Money
)

/**
 * 退款用例。
 * 规则：
 *  - 只能对 AUTHORIZED / CAPTURED 状态退款
 *  - 退款金额必须 > 0 且不超过原支付金额
 *  - 币种必须一致
 */
class RefundPaymentHandler(
    private val paymentRepository: PaymentRepository,
    private val paymentGateway: PaymentGateway,
    private val eventPublisher: DomainEventPublisher,
    private val outbox: Outbox
) : CommandHandler<RefundPaymentCommand, Unit> {

    override fun handle(command: RefundPaymentCommand) {
        val payment: Payment = paymentRepository.findById(command.paymentId)
            ?: throw InvalidPaymentStateException(
                currentStatus = PaymentStatus.Pending,
                action = "refund",
                reason = "支付不存在"
            )

        val extId = payment.externalPaymentId
            ?: throw InvalidPaymentStateException(
                currentStatus = payment.status,
                action = "refund",
                reason = "缺少外部支付 ID"
            )

        // 网关侧退款（amount 不一致会抛 GatewayRejectionException）
        val response = paymentGateway.refund(extId, command.refundAmount)
        @Suppress("UNUSED_VARIABLE") val _resp = response

        val event = payment.markRefunded(command.refundAmount)
        paymentRepository.save(payment, expectedVersion = payment.version - 1)

        val envelope = EventEnvelope.of(event)
        outbox.enqueue(envelope)
        eventPublisher.publish(event)
    }
}