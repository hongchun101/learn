package io.github.dddlearning.payments.application

import io.github.dddlearning.application.CommandHandler
import io.github.dddlearning.port.DomainEventPublisher
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.inmemory.SystemClock
import io.github.dddlearning.inmemory.UuidIdGenerator
import io.github.dddlearning.messaging.EventEnvelope
import io.github.dddlearning.messaging.Outbox
import io.github.dddlearning.payments.domain.exception.InvalidPaymentAmountException
import io.github.dddlearning.payments.domain.model.Payment
import io.github.dddlearning.payments.domain.repository.GatewayChargeRequest
import io.github.dddlearning.payments.domain.repository.GatewayRejectionException
import io.github.dddlearning.payments.domain.repository.PaymentGateway
import io.github.dddlearning.payments.domain.repository.PaymentRepository
import io.github.dddlearning.port.Clock
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.value.Money
import java.time.Instant

/**
 * 授权支付用例。
 *
 * 流程：
 *  1. 在仓储层检查同一业务键（orderReference + currency）是否已存在活跃支付；
 *     若有，返回 Duplicate —— **绝不重复扣款**。
 *  2. 创建新的 Payment 聚合根（PENDING 状态），保存到仓储。
 *  3. 调用 PaymentGateway.authorize(...) 发起授权。
 *  4. 根据网关结果：
 *       - 成功 → markAuthorized(externalId)，发布 PaymentAuthorized 事件到 outbox。
 *       - 失败 → markFailed(reason)，发布 PaymentFailed 事件到 outbox。
 *  5. 整笔事务通过 outbox + publisher 发布到下游。
 *
 * 关键设计：
 *  - 幂等性由仓储层的 findActiveByOrderReference 实现；
 *    handler 不直接做锁，而让仓储层在 save 时用乐观锁兜底。
 *  - 网关异常永远被翻译为 [GatewayRejectionException]，绝不向上抛具体 SDK 异常。
 *  - Payment 聚合根在内部封装所有状态转换；handler 不写"currentStatus = ..."这样的代码。
 *  - IdGenerator / Clock 通过构造注入；测试可替换为确定性版本以保证可重放。
 */
class AuthorizePaymentHandler(
    private val paymentRepository: PaymentRepository,
    private val paymentGateway: PaymentGateway,
    private val eventPublisher: DomainEventPublisher,
    private val outbox: Outbox,
    private val eventIdGen: IdGenerator<EventId> = UuidIdGenerator,
    private val clock: Clock = SystemClock
) : CommandHandler<AuthorizePaymentCommand, AuthorizePaymentResult> {

    /**
     * 处理授权命令。
     *
     * 抛出：
     *  - [InvalidPaymentAmountException] 命令金额非法
     *  - [GatewayRejectionException]    网关调用本身异常（非业务拒绝）
     *
     * 注：业务拒绝（DECLINED / INSUFFICIENT_FUNDS 等）被翻译为 PaymentFailed 事件，
     * 不会作为异常向外传播；调用方通过 AuthorizePaymentResult 与仓储状态判断。
     */
    override fun handle(command: AuthorizePaymentCommand): AuthorizePaymentResult {
        validateAmount(command.amount)

        // 1. 幂等键：业务侧去重
        val existing = paymentRepository.findActiveByOrderReference(command.orderReference)
        if (existing != null) {
            return AuthorizePaymentResult.Duplicate(existingPaymentId = existing.id)
        }

        // 2. 创建新的 Payment 聚合根（PENDING）
        val newPayment = Payment.create(
            paymentId = command.paymentId,
            orderReference = command.orderReference,
            amount = command.amount,
            eventIdGen = eventIdGen,
            clock = { clock.now() }
        )
        val savedPayment = paymentRepository.save(newPayment, expectedVersion = 0L)

        // 3. 调用网关
        val gatewayRequest = GatewayChargeRequest(
            paymentId = savedPayment.id,
            idempotencyKey = command.orderReference,
            amount = savedPayment.amount,
            description = command.description
        )

        val domainEvent: io.github.dddlearning.domain.DomainEvent = try {
            val response = paymentGateway.authorize(gatewayRequest)
            savedPayment.markAuthorized(response.externalPaymentId)
        } catch (rejection: GatewayRejectionException) {
            savedPayment.markFailed(rejection.reason.name)
        }

        // 4. 持久化新状态（乐观锁：save 会校验 expectedVersion）
        paymentRepository.save(savedPayment, expectedVersion = savedPayment.version - 1)

        // 5. 发布事件：先入 outbox，再由 publisher 通知到当前进程内的订阅者
        val envelope = EventEnvelope.of(domainEvent)
        outbox.enqueue(envelope)
        eventPublisher.publish(domainEvent)

        return AuthorizePaymentResult.Created(savedPayment.id)
    }

    private fun validateAmount(amount: Money) {
        if (amount.compareTo(Money.zero(amount.currency)) <= 0) {
            throw InvalidPaymentAmountException("支付金额必须 > 0, 当前为 ${amount.amount}")
        }
    }
}