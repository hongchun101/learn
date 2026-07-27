package io.github.dddlearning.payments.domain.model

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.payments.domain.events.PaymentAuthorized
import io.github.dddlearning.payments.domain.events.PaymentCaptured
import io.github.dddlearning.payments.domain.events.PaymentFailed
import io.github.dddlearning.payments.domain.events.PaymentRefunded
import io.github.dddlearning.payments.domain.exception.InvalidPaymentAmountException
import io.github.dddlearning.payments.domain.exception.InvalidPaymentStateException
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Payment 聚合根的单元测试。
 *
 * 覆盖：
 *  - 状态转换守卫
 *  - 金额 / 币种 / 业务键校验
 *  - 事件生成
 *  - 状态查询
 */
class PaymentTest {
    private val fixedEventIds = listOf(
        EventId("evt-1"),
        EventId("evt-2"),
        EventId("evt-3"),
        EventId("evt-4"),
        EventId("evt-5"),
        EventId("evt-6")
    )
    private val fixedTimes = listOf(100L, 200L, 300L, 400L, 500L, 600L)
        .map { java.time.Instant.ofEpochMilli(it) }

    private val seqIdGen = object : IdGenerator<EventId> {
        private var i = 0
        override fun nextId(): EventId = fixedEventIds[i++]
    }
    private val seqClock = object : () -> java.time.Instant {
        private var i = 0
        override fun invoke(): java.time.Instant = fixedTimes[i++]
    }

    private fun newPending(
        orderRef: String = "ORDER-1",
        amount: Money = Money.of(Currency.USD, java.math.BigDecimal("99.99")),
        paymentId: PaymentId = PaymentId.of("pay-1")
    ): Payment = Payment.create(paymentId, orderRef, amount, seqIdGen, seqClock)

    // ---------- 创建校验 ----------

    @Test
    fun `create rejects blank orderReference`() {
        val ex = assertThrows<IllegalArgumentException> {
            Payment.create(
                PaymentId.of("p"),
                "  ",
                Money.of(Currency.USD, java.math.BigDecimal("10.00")),
                seqIdGen,
                seqClock
            )
        }
        assertTrue(ex.message!!.contains("orderReference"))
    }

    @Test
    fun `create rejects zero amount`() {
        val ex = assertThrows<InvalidPaymentAmountException> {
            Payment.create(
                PaymentId.of("p"),
                "ORDER-1",
                Money.zero(Currency.USD),
                seqIdGen,
                seqClock
            )
        }
        assertTrue(ex.message!!.contains("> 0"))
    }


    @Test
    fun `newly created payment is in Pending state`() {
        val p = newPending()
        assertEquals(PaymentStatus.Pending, p.status)
        assertEquals(0L, p.version)
        assertNull(p.externalPaymentId)
        assertTrue(p.peekDomainEvents().isEmpty())
    }

    // ---------- 授权 ----------

    @Test
    fun `markAuthorized transitions Pending to Authorized and emits event`() {
        val p = newPending()
        val extId = ExternalPaymentId.of("ext-1")

        val event = p.markAuthorized(extId)

        assertEquals(PaymentStatus.Authorized, p.status)
        assertEquals(extId, p.externalPaymentId)
        assertEquals(1L, p.version)
        assertTrue(p.isAuthorized)
        assertFalse(p.isTerminal)
        assertFalse(p.isCaptured)

        assertTrue(event is PaymentAuthorized)
        assertEquals(extId, event.externalPaymentId)
        assertEquals(p.id, event.paymentId)
        assertEquals(p.orderReference, event.orderReference)
        assertEquals(p.amount, event.amount)
    }

    @Test
    fun `markAuthorized is rejected on non-pending states`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))

        assertThrows<InvalidPaymentStateException> {
            p.markAuthorized(ExternalPaymentId.of("ext-2"))
        }
    }

    @Test
    fun `markAuthorized rejected on Failed state`() {
        val p = newPending()
        p.markFailed("DECLINED")
        assertThrows<InvalidPaymentStateException> {
            p.markAuthorized(ExternalPaymentId.of("ext-1"))
        }
    }

    // ---------- 失败 ----------

    @Test
    fun `markFailed transitions Pending to Failed and emits PaymentFailed`() {
        val p = newPending()
        val event = p.markFailed("INSUFFICIENT_FUNDS")

        assertEquals(PaymentStatus.Failed, p.status)
        assertEquals(1L, p.version)
        assertTrue(p.isTerminal)

        assertTrue(event is PaymentFailed)
        assertEquals("INSUFFICIENT_FUNDS", event.reason)
    }

    @Test
    fun `markFailed rejects blank reason`() {
        val p = newPending()
        assertThrows<IllegalArgumentException> {
            p.markFailed("   ")
        }
    }

    @Test
    fun `markFailed is rejected on Captured state`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))
        p.markCaptured()

        assertThrows<InvalidPaymentStateException> {
            p.markFailed("ANY")
        }
    }

    // ---------- Capture ----------

    @Test
    fun `markCaptured transitions Authorized to Captured and emits event`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))

        val event = p.markCaptured()

        assertEquals(PaymentStatus.Captured, p.status)
        assertEquals(2L, p.version)
        assertTrue(p.isCaptured)
        assertTrue(event is PaymentCaptured)
    }

    @Test
    fun `markCaptured is rejected on Pending state`() {
        val p = newPending()
        assertThrows<InvalidPaymentStateException> { p.markCaptured() }
    }

    @Test
    fun `markCaptured is rejected on Failed state`() {
        val p = newPending()
        p.markFailed("DECLINED")
        assertThrows<InvalidPaymentStateException> { p.markCaptured() }
    }

    // ---------- 退款 ----------

    @Test
    fun `markRefunded allows full refund on Captured`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))
        p.markCaptured()

        val event = p.markRefunded(p.amount)

        assertEquals(PaymentStatus.Refunded, p.status)
        assertTrue(event is PaymentRefunded)
        assertTrue(event.isFullRefund)
    }

    @Test
    fun `markRefunded allows partial refund on Authorized`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))

        val partial = Money.of(Currency.USD, java.math.BigDecimal("40.00"))
        val event = p.markRefunded(partial)

        assertEquals(PaymentStatus.Refunded, p.status)
        assertFalse(event.isFullRefund)
    }

    @Test
    fun `markRefunded rejects refund exceeding payment amount`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))
        val tooMuch = Money.of(Currency.USD, java.math.BigDecimal("1000.00"))

        assertThrows<InvalidPaymentAmountException> {
            p.markRefunded(tooMuch)
        }
    }

    @Test
    fun `markRefunded rejects refund with different currency`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))
        val eur = Money.of(Currency.EUR, java.math.BigDecimal("10.00"))

        assertThrows<InvalidPaymentAmountException> {
            p.markRefunded(eur)
        }
    }

    @Test
    fun `markRefunded is rejected on Pending state`() {
        val p = newPending()
        assertThrows<InvalidPaymentStateException> {
            p.markRefunded(Money.of(Currency.USD, java.math.BigDecimal("1.00")))
        }
    }

    @Test
    fun `markRefunded is rejected on Failed state`() {
        val p = newPending()
        p.markFailed("DECLINED")
        assertThrows<InvalidPaymentStateException> {
            p.markRefunded(Money.of(Currency.USD, java.math.BigDecimal("1.00")))
        }
    }

    // ---------- 事件清空 ----------

    @Test
    fun `pullDomainEvents clears buffer after returning snapshot`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))

        val snapshot = p.pullDomainEvents()
        assertEquals(1, snapshot.size)
        assertTrue(p.peekDomainEvents().isEmpty())
        assertTrue(p.pullDomainEvents().isEmpty())
    }

    @Test
    fun `peekDomainEvents does not clear`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))

        val first = p.peekDomainEvents()
        val second = p.peekDomainEvents()
        assertEquals(first.size, second.size)
        assertEquals(1, first.size)
    }

    @Test
    fun `multiple transitions accumulate events in order`() {
        val p = newPending()
        p.markAuthorized(ExternalPaymentId.of("ext-1"))
        p.markCaptured()

        val events = p.pullDomainEvents()
        assertEquals(2, events.size)
        assertTrue(events[0] is PaymentAuthorized)
        assertTrue(events[1] is PaymentCaptured)
    }

    // ---------- 重建 ----------

    @Test
    fun `rehydrate restores Payment state without emitting events`() {
        val original = newPending()
        original.markAuthorized(ExternalPaymentId.of("ext-1"))
        original.pullDomainEvents()  // 清空

        val rehydrated = Payment.rehydrate(
            id = original.id,
            orderReference = original.orderReference,
            amount = original.amount,
            status = original.status,
            externalPaymentId = original.externalPaymentId,
            version = original.version,
            eventIdGen = seqIdGen,
            clock = seqClock
        )

        assertEquals(PaymentStatus.Authorized, rehydrated.status)
        assertEquals(original.version, rehydrated.version)
        assertEquals(ExternalPaymentId.of("ext-1"), rehydrated.externalPaymentId)
        assertTrue(rehydrated.peekDomainEvents().isEmpty(),
            "重建不应产生任何领域事件")
    }

    // ---------- 身份 / 不可变性 ----------

    @Test
    fun `payment equals another with same id and concrete class`() {
        val p1 = newPending(paymentId = PaymentId.of("pay-A"))
        val p2 = newPending(paymentId = PaymentId.of("pay-A"))
        val p3 = newPending(paymentId = PaymentId.of("pay-B"))

        assertEquals(p1, p2)
        assertFalse(p1 == p3)
        assertNotNull(p1.id)
    }
}