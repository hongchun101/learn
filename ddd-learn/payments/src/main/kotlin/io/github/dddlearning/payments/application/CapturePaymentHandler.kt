package io.github.dddlearning.payments.application

import io.github.dddlearning.application.CommandHandler
import io.github.dddlearning.port.DomainEventPublisher
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.messaging.EventEnvelope
import io.github.dddlearning.messaging.Outbox
import io.github.dddlearning.payments.domain.exception.InvalidPaymentStateException
import io.github.dddlearning.payments.domain.model.Payment
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.payments.domain.model.PaymentStatus
import io.github.dddlearning.payments.domain.repository.PaymentGateway
import io.github.dddlearning.payments.domain.repository.PaymentRepository
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.inmemory.UuidIdGenerator
import java.time.Clock

/**
 * 结算命令：将一笔已授权的支付提交到网关进行资金入账。
 */
data class CapturePaymentCommand(val paymentId: PaymentId)

/**
 * 结算用例。规则：
 *  - 只有 AUTHORIZED 状态的支付可以结算
 *  - 网关拒绝时抛出 [GatewayRejectionException]；不写入 PaymentCaptured 事件
 */
class CapturePaymentHandler(
    private val paymentRepository: PaymentRepository,
    private val paymentGateway: PaymentGateway,
    private val eventPublisher: DomainEventPublisher,
    private val outbox: Outbox,
    private val eventIdGen: IdGenerator<EventId> = UuidIdGenerator,
    private val clock: Clock = Clock.systemUTC()
) : CommandHandler<CapturePaymentCommand, Unit> {

    override fun handle(command: CapturePaymentCommand) {
        val payment: Payment = paymentRepository.findById(command.paymentId)
            ?: throw InvalidPaymentStateException(
                currentStatus = PaymentStatus.Pending,
                action = "capture",
                reason = "支付不存在"
            )

        val extId = payment.externalPaymentId
            ?: throw InvalidPaymentStateException(
                currentStatus = payment.status,
                action = "capture",
                reason = "缺少外部支付 ID"
            )

        val response = paymentGateway.capture(extId, payment.amount)
        @Suppress("UNUSED_VARIABLE") val _resp = response

        val event = payment.markCaptured()
        paymentRepository.save(payment, expectedVersion = payment.version - 1)

        val envelope = EventEnvelope.of(event)
        outbox.enqueue(envelope)
        eventPublisher.publish(event)
    }
}