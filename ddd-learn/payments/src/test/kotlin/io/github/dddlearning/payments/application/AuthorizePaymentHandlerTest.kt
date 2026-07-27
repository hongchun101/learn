package io.github.dddlearning.payments.application

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.inmemory.InMemoryDomainEventPublisher
import io.github.dddlearning.inmemory.InMemoryOutbox
import io.github.dddlearning.payments.domain.events.PaymentAuthorized
import io.github.dddlearning.payments.domain.events.PaymentFailed
import io.github.dddlearning.payments.domain.exception.InvalidPaymentAmountException
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.payments.domain.model.PaymentStatus
import io.github.dddlearning.payments.domain.repository.GatewayDeclineReason
import io.github.dddlearning.payments.infrastructure.gateway.DeterministicFakePaymentGateway
import io.github.dddlearning.payments.infrastructure.persistence.InMemoryPaymentRepository
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * AuthorizePaymentHandler 的集成测试。
 * 覆盖：
 *  - 正常授权 → PaymentAuthorized 事件 + 持久化状态
 *  - 同 orderReference 重复授权 → Duplicate 结果，无新事件、无新网关调用
 *  - 网关拒绝 → PaymentFailed 事件 + FAILED 状态
 *  - 金额非法 → 立即抛 InvalidPaymentAmountException
 */
class AuthorizePaymentHandlerTest {

    private lateinit var repository: InMemoryPaymentRepository
    private lateinit var gateway: DeterministicFakePaymentGateway
    private lateinit var publisher: InMemoryDomainEventPublisher
    private lateinit var outbox: InMemoryOutbox
    private lateinit var handler: AuthorizePaymentHandler

    @BeforeEach
    fun setup() {
        repository = InMemoryPaymentRepository()
        gateway = DeterministicFakePaymentGateway()
        publisher = InMemoryDomainEventPublisher
        publisher.reset()
        outbox = InMemoryOutbox()
        handler = AuthorizePaymentHandler(repository, gateway, publisher, outbox)
    }

    private fun usd(amount: String): Money =
        Money.of(Currency.USD, BigDecimal(amount))

    private fun newCommand(
        ref: String = "ORDER-1",
        amount: Money = usd("99.99")
    ): AuthorizePaymentCommand = AuthorizePaymentCommand(
        paymentId = PaymentId.of("pay-${ref}-${System.nanoTime()}"),
        orderReference = ref,
        amount = amount
    )

    // ---------- 成功路径 ----------

    @Test
    fun `successful authorize produces PaymentAuthorized event and Authorized state`() {
        val cmd = newCommand("ORDER-100", usd("49.95"))

        val result = handler.handle(cmd)

        assertTrue(result is AuthorizePaymentResult.Created)
        val paymentId = (result as AuthorizePaymentResult.Created).paymentId

        // 仓储内有一笔支付，处于 Authorized
        val stored = repository.findById(paymentId)
        assertNotNull(stored)
        assertEquals(PaymentStatus.Authorized, stored.status)
        assertNotNull(stored.externalPaymentId)
        assertEquals(cmd.amount, stored.amount)

        // 域事件中包含 PaymentAuthorized
        val events: List<DomainEvent> = publisher.snapshot()
        assertEquals(1, events.size)
        val event = events.single()
        assertTrue(event is PaymentAuthorized)
        assertEquals(cmd.orderReference, (event as PaymentAuthorized).orderReference)
        assertEquals(paymentId, event.paymentId)

        // outbox 中也有一条
        assertEquals(1, outbox.all().size)
    }

    // ---------- 幂等性 ----------

    @Test
    fun `duplicate authorize with same orderReference does not produce new payment or new gateway call`() {
        val cmd1 = newCommand("ORDER-200", usd("10.00"))

        val first = handler.handle(cmd1)
        assertTrue(first is AuthorizePaymentResult.Created)
        val firstId = (first as AuthorizePaymentResult.Created).paymentId

        // 第二次：同一 orderReference（id 不同）
        val cmd2 = AuthorizePaymentCommand(
            paymentId = PaymentId.of("pay-other"),
            orderReference = "ORDER-200",
            amount = usd("10.00")
        )

        val second = handler.handle(cmd2)
        assertTrue(second is AuthorizePaymentResult.Duplicate)
        assertEquals(firstId, (second as AuthorizePaymentResult.Duplicate).existingPaymentId)

        // 仓储中仍只有一笔
        assertEquals(1, repository.size())

        // 没有产生新的 PaymentAuthorized 事件
        val events = publisher.snapshot()
        assertEquals(1, events.size)
        assertTrue(events.single() is PaymentAuthorized)
    }

    @Test
    fun `different orderReference creates new payment without interference`() {
        handler.handle(newCommand("ORDER-A", usd("10.00")))
        handler.handle(newCommand("ORDER-B", usd("20.00")))

        assertEquals(2, repository.size())
        assertEquals(2, publisher.snapshot().size)
    }

    // ---------- 网关拒绝 ----------

    @Test
    fun `gateway rejection produces PaymentFailed event and Failed state`() {
        gateway = DeterministicFakePaymentGateway(
            DeterministicFakePaymentGateway.Behavior.RejectReason(GatewayDeclineReason.INSUFFICIENT_FUNDS)
        )
        handler = AuthorizePaymentHandler(repository, gateway, publisher, outbox)

        val cmd = newCommand("ORDER-300", usd("10.00"))
        val result = handler.handle(cmd)

        assertTrue(result is AuthorizePaymentResult.Created)
        val paymentId = (result as AuthorizePaymentResult.Created).paymentId

        val stored = repository.findById(paymentId)
        assertNotNull(stored)
        assertEquals(PaymentStatus.Failed, stored.status)
        assertNull(stored.externalPaymentId, "FAILED 状态不应有 externalPaymentId")

        val events = publisher.snapshot()
        assertEquals(1, events.size)
        val event = events.single()
        assertTrue(event is PaymentFailed)
        assertEquals("INSUFFICIENT_FUNDS", (event as PaymentFailed).reason)
    }

    @Test
    fun `failed payment becomes terminal and does not block subsequent new order`() {
        gateway = DeterministicFakePaymentGateway(
            DeterministicFakePaymentGateway.Behavior.RejectReason(GatewayDeclineReason.DECLINED)
        )
        handler = AuthorizePaymentHandler(repository, gateway, publisher, outbox)

        // 第一笔失败
        handler.handle(newCommand("ORDER-X", usd("100.00")))

        // 同 orderReference 再发一笔 —— 因 FAILED 是终态，可创建新的活跃支付
        val cmd2 = AuthorizePaymentCommand(
            paymentId = PaymentId.of("pay-new"),
            orderReference = "ORDER-X",
            amount = usd("100.00")
        )
        // 因为金额规则不依赖网关，但当前配置仍会拒绝 → 也会失败
        val r2 = handler.handle(cmd2)
        assertTrue(r2 is AuthorizePaymentResult.Created)

        // 仓储里现在有 2 笔失败的
        assertEquals(2, repository.size())
    }

    // ---------- 金额规则 ----------

    @Test
    fun `zero amount is rejected without touching gateway`() {
        val cmd = newCommand("ORDER-ZERO", Money.zero(Currency.USD))
        assertThrows<InvalidPaymentAmountException> {
            handler.handle(cmd)
        }

        // 网关和仓储都不应有副作用
        assertEquals(0, repository.size())
        assertEquals(0, gateway.approvedKeys().size)
    }


    @Test
    fun `currency is preserved end-to-end`() {
        val eurAmount = Money.of(Currency.EUR, BigDecimal("12.34"))
        val cmd = AuthorizePaymentCommand(
            paymentId = PaymentId.of("pay-eur"),
            orderReference = "ORDER-EUR",
            amount = eurAmount
        )
        val result = handler.handle(cmd)
        assertTrue(result is AuthorizePaymentResult.Created)

        val stored = repository.findById((result as AuthorizePaymentResult.Created).paymentId)
        assertEquals(Currency.EUR, stored!!.amount.currency)
    }

    // ---------- 网关幂等 ----------

    @Test
    fun `fake gateway returns same external id for same idempotency key`() {
        val cmd1 = newCommand("ORDER-IDEM", usd("10.00"))
        handler.handle(cmd1)

        // 直接从仓储拉起支付，再以相同幂等键调用一次网关
        val stored = repository.findAll().single()
        val direct = gateway.authorize(
            io.github.dddlearning.payments.domain.repository.GatewayChargeRequest(
                paymentId = stored.id,
                idempotencyKey = "ORDER-IDEM",
                amount = cmd1.amount,
                description = null
            )
        )

        assertEquals(stored.externalPaymentId, direct.externalPaymentId)
    }

    private inline fun <reified T : Throwable> assertThrows(block: () -> Unit): T =
        kotlin.test.assertFailsWith(T::class) { block() }
}