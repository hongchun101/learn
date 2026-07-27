package io.github.dddlearning.payments.infrastructure.gateway

import io.github.dddlearning.payments.domain.model.ExternalPaymentId
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.payments.domain.repository.GatewayChargeRequest
import io.github.dddlearning.payments.domain.repository.GatewayDeclineReason
import io.github.dddlearning.payments.domain.repository.GatewayRejectionException
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.math.BigDecimal
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * DeterministicFakePaymentGateway 行为测试。
 *
 * 覆盖：
 *  - ApproveAll 行为
 *  - RejectAll / RejectAbove / RejectCurrency / RejectKeyPrefix / RejectReason 行为
 *  - 同一 idempotencyKey 多次调用返回相同 ExternalPaymentId（强幂等）
 *  - capture / refund 直接返回 GatewayAuthorization
 */
class DeterministicFakePaymentGatewayTest {

    private val usd100 = Money.of(Currency.USD, BigDecimal("100.00"))
    private val usd50 = Money.of(Currency.USD, BigDecimal("50.00"))
    private val eur100 = Money.of(Currency.EUR, BigDecimal("100.00"))

    private fun request(
        key: String = "key-1",
        amount: Money = usd100,
        paymentId: PaymentId = PaymentId.of("pay-1")
    ): GatewayChargeRequest = GatewayChargeRequest(
        paymentId = paymentId,
        idempotencyKey = key,
        amount = amount,
        description = null
    )

    // ---------- ApproveAll ----------

    @Test
    fun `ApproveAll returns success with stable external id`() {
        val gw = DeterministicFakePaymentGateway(DeterministicFakePaymentGateway.Behavior.ApproveAll)

        val r1 = gw.authorize(request(key = "ORDER-1"))
        val r2 = gw.authorize(request(key = "ORDER-1"))

        assertEquals(r1.externalPaymentId, r2.externalPaymentId)
        assertEquals(usd100, r1.authorizedAmount)
        assertTrue(r1.externalPaymentId.value.startsWith("ext-ORDER-1"))
    }

    @Test
    fun `ApproveAll keeps keys in approved set`() {
        val gw = DeterministicFakePaymentGateway(DeterministicFakePaymentGateway.Behavior.ApproveAll)
        gw.authorize(request(key = "A"))
        gw.authorize(request(key = "B"))
        assertEquals(setOf("A", "B"), gw.approvedKeys())
        assertEquals(0, gw.declinedKeys().size)
    }

    // ---------- 拒绝行为 ----------

    @Test
    fun `RejectAll rejects everything`() {
        val gw = DeterministicFakePaymentGateway(DeterministicFakePaymentGateway.Behavior.RejectAll)
        assertThrows<GatewayRejectionException> { gw.authorize(request()) }
        assertEquals(1, gw.declinedKeys().size)
    }

    @Test
    fun `RejectAbove rejects only amounts above threshold`() {
        val gw = DeterministicFakePaymentGateway(
            DeterministicFakePaymentGateway.Behavior.RejectAbove(Money.of(Currency.USD, BigDecimal("100.00")))
        )
        gw.authorize(request(key = "LOW", amount = usd50))
        gw.authorize(request(key = "HIGH", amount = usd100))
        assertThrows<GatewayRejectionException> {
            gw.authorize(request(key = "BIG", amount = Money.of(Currency.USD, BigDecimal("101.00"))))
        }
        assertEquals(setOf("LOW", "HIGH"), gw.approvedKeys())
        assertEquals(setOf("BIG"), gw.declinedKeys())
    }

    @Test
    fun `RejectCurrency rejects only specified currency`() {
        val gw = DeterministicFakePaymentGateway(
            DeterministicFakePaymentGateway.Behavior.RejectCurrency(Currency.EUR)
        )
        gw.authorize(request(key = "USD", amount = usd100))
        assertThrows<GatewayRejectionException> {
            gw.authorize(request(key = "EUR", amount = eur100))
        }
        assertEquals(setOf("USD"), gw.approvedKeys())
        assertEquals(setOf("EUR"), gw.declinedKeys())
    }

    @Test
    fun `RejectKeyPrefix rejects matching prefix`() {
        val gw = DeterministicFakePaymentGateway(
            DeterministicFakePaymentGateway.Behavior.RejectKeyPrefix("FRAUD-")
        )
        gw.authorize(request(key = "GOOD-1"))
        assertThrows<GatewayRejectionException> {
            gw.authorize(request(key = "FRAUD-123"))
        }
    }

    @Test
    fun `RejectReason carries specified reason code`() {
        val gw = DeterministicFakePaymentGateway(
            DeterministicFakePaymentGateway.Behavior.RejectReason(GatewayDeclineReason.INSUFFICIENT_FUNDS)
        )
        val ex = assertThrows<GatewayRejectionException> { gw.authorize(request()) }
        assertEquals(GatewayDeclineReason.INSUFFICIENT_FUNDS, ex.reason)
    }

    @Test
    fun `Custom behavior receives full request`() {
        val seen = mutableListOf<GatewayChargeRequest>()
        val gw = DeterministicFakePaymentGateway(
            DeterministicFakePaymentGateway.Behavior.Custom { req ->
                seen += req
                if (req.amount.compareTo(usd100) >= 0) GatewayDeclineReason.DECLINED else null
            }
        )
        gw.authorize(request(key = "SMALL", amount = usd50))
        assertThrows<GatewayRejectionException> {
            gw.authorize(request(key = "BIG", amount = usd100))
        }
        assertEquals(2, seen.size)
    }

    // ---------- 幂等性 ----------

    @Test
    fun `idempotent approve returns cached authorization after repeat`() {
        val gw = DeterministicFakePaymentGateway(DeterministicFakePaymentGateway.Behavior.ApproveAll)
        val first = gw.authorize(request(key = "KEEP"))

        // 即使把网关改成全部拒绝，重复调用相同 key 也应返回之前的结果
        // （这里的实现并不支持中途改 behavior；幂等性验证通过两次 ApproveAll 完成）
        val second = gw.authorize(request(key = "KEEP"))
        assertEquals(first.externalPaymentId, second.externalPaymentId)
        assertEquals(first.authorizedAmount, second.authorizedAmount)
    }

    @Test
    fun `decline is cached per key`() {
        val gw = DeterministicFakePaymentGateway(DeterministicFakePaymentGateway.Behavior.RejectAll)
        val first = assertThrows<GatewayRejectionException> { gw.authorize(request(key = "X")) }
        val second = assertThrows<GatewayRejectionException> { gw.authorize(request(key = "X")) }
        assertEquals(first.reason, second.reason)
        assertEquals(1, gw.declinedKeys().size)
    }

    // ---------- capture / refund ----------

    @Test
    fun `capture returns authorization with the same external id and amount`() {
        val gw = DeterministicFakePaymentGateway(DeterministicFakePaymentGateway.Behavior.ApproveAll)
        val ext = ExternalPaymentId.of("ext-A")
        val resp = gw.capture(ext, usd100)
        assertEquals(ext, resp.externalPaymentId)
        assertEquals(usd100, resp.authorizedAmount)
    }

    @Test
    fun `refund returns authorization with refund amount`() {
        val gw = DeterministicFakePaymentGateway(DeterministicFakePaymentGateway.Behavior.ApproveAll)
        val ext = ExternalPaymentId.of("ext-A")
        val partial = Money.of(Currency.USD, BigDecimal("30.00"))
        val resp = gw.refund(ext, partial)
        assertEquals(ext, resp.externalPaymentId)
        assertEquals(partial, resp.authorizedAmount)
    }

    @Test
    fun `companion rejectAbove builds RejectAbove with Money from BigDecimal`() {
        val gw = DeterministicFakePaymentGateway(
            DeterministicFakePaymentGateway.rejectAbove(Currency.USD, BigDecimal("50"))
        )
        gw.authorize(request(key = "SMALL", amount = Money.of(Currency.USD, BigDecimal("10"))))
        assertThrows<GatewayRejectionException> {
            gw.authorize(request(key = "BIG", amount = Money.of(Currency.USD, BigDecimal("60"))))
        }
        assertNotNull(gw)
    }
}