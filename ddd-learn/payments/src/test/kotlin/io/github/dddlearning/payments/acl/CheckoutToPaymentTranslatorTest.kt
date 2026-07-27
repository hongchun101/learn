package io.github.dddlearning.payments.acl

import io.github.dddlearning.payments.application.AuthorizePaymentCommand
import io.github.dddlearning.payments.domain.exception.InvalidPaymentAmountException
import io.github.dddlearning.value.Currency
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * CheckoutToPaymentTranslator 的单元测试。
 *
 * 覆盖：
 *  - 标准请求 → AuthorizePaymentCommand
 *  - 字段缺失/格式非法 → CheckoutTranslationException
 *  - 上游字符串金额/币种 → 强类型 Money / Currency
 *  - 翻译层不与领域共享错误类型
 */
class CheckoutToPaymentTranslatorTest {

    private fun req(
        paymentId: String = "pay-1",
        orderRef: String = "ORDER-1",
        amount: String = "99.99",
        currency: String = "USD"
    ): CheckoutRequest = CheckoutRequest(
        paymentId = paymentId,
        orderReference = orderRef,
        amount = amount,
        currency = currency
    )

    @Test
    fun `translates standard request into command`() {
        val cmd: AuthorizePaymentCommand = CheckoutToPaymentTranslator.translate(req())
        assertEquals("pay-1", cmd.paymentId.value)
        assertEquals("ORDER-1", cmd.orderReference)
        assertEquals(Currency.USD, cmd.amount.currency)
        assertEquals(99.toBigDecimal().plus(java.math.BigDecimal("0.99")), cmd.amount.amount)
        assertNull(cmd.description)
    }

    @Test
    fun `lowercase currency code is normalized to uppercase`() {
        val cmd = CheckoutToPaymentTranslator.translate(req(currency = "eur"))
        assertEquals(Currency.EUR, cmd.amount.currency)
    }

    @Test
    fun `unknown currency raises translation exception`() {
        val ex = assertThrows<CheckoutTranslationException> {
            CheckoutToPaymentTranslator.translate(req(currency = "XYZ"))
        }
        assertNotNull(ex.message)
        assert(ex.message!!.contains("币种") || ex.message!!.contains("currency", ignoreCase = true))
    }

    @Test
    fun `blank payment id raises translation exception`() {
        assertThrows<CheckoutTranslationException> {
            CheckoutToPaymentTranslator.translate(req(paymentId = "  "))
        }
    }

    @Test
    fun `blank order reference raises translation exception`() {
        assertThrows<CheckoutTranslationException> {
            CheckoutToPaymentTranslator.translate(req(orderRef = ""))
        }
    }

    @Test
    fun `blank amount raises translation exception`() {
        assertThrows<CheckoutTranslationException> {
            CheckoutToPaymentTranslator.translate(req(amount = ""))
        }
    }

    @Test
    fun `non-numeric amount raises translation exception`() {
        assertThrows<CheckoutTranslationException> {
            CheckoutToPaymentTranslator.translate(req(amount = "abc"))
        }
    }

    @Test
    fun `zero or negative amount raises translation exception`() {
        assertThrows<CheckoutTranslationException> {
            CheckoutToPaymentTranslator.translate(req(amount = "0"))
        }
        assertThrows<CheckoutTranslationException> {
            CheckoutToPaymentTranslator.translate(req(amount = "-1.00"))
        }
    }

    @Test
    fun `translation exception about amount can be remapped to domain exception`() {
        val ex = assertThrows<CheckoutTranslationException> {
            CheckoutToPaymentTranslator.translate(req(amount = "0"))
        }
        val domain = assertThrows<InvalidPaymentAmountException> {
            CheckoutTranslationException.rethrowAsDomainError(ex)
        }
        assertNotNull(domain.message)
    }

    @Test
    fun `non-amount translation exception is not remapped to domain exception`() {
        val ex = assertThrows<CheckoutTranslationException> {
            CheckoutToPaymentTranslator.translate(req(currency = "XYZ"))
        }
        assertThrows<CheckoutTranslationException> {
            CheckoutTranslationException.rethrowAsDomainError(ex)
        }
    }

    @Test
    fun `description is passed through verbatim`() {
        val req = CheckoutRequest(
            paymentId = "p1",
            orderReference = "O1",
            amount = "10.00",
            currency = "USD",
            description = "商品一批"
        )
        val cmd = CheckoutToPaymentTranslator.translate(req)
        assertEquals("商品一批", cmd.description)
    }
}