package io.github.dddlearning.payments.acl

import io.github.dddlearning.payments.application.AuthorizePaymentCommand
import io.github.dddlearning.payments.domain.exception.InvalidPaymentAmountException
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import java.math.BigDecimal

/**
 * 上游（任意渠道：HTTP、消息、订单系统）传来的"通用结账请求"。
 *
 * 这是反腐蚀层的入口语言（来自上游，模型可能是任何形式）。
 * 它故意不暴露给 payments 领域代码，避免污染内部模型。
 */
data class CheckoutRequest(
    val paymentId: String,
    val orderReference: String,
    val amount: String,           // 上游可能传字符串数字
    val currency: String,         // 上游可能传 ISO 4217 字符串
    val description: String? = null,
    val metadata: Map<String, String> = emptyMap()
)

/**
 * 上游结账 → 支付上下文授权命令的翻译器（Anti-Corruption Layer）。
 *
 * 职责：
 *  - 把任意上游字段格式标准化为 payments 的强类型模型。
 *  - 对不可信数据进行第一道校验（金额 > 0、币种合法等）。
 *  - 在翻译失败时抛 [CheckoutTranslationException]，绝不向上游抛出内部异常。
 *
 * 设计要点：
 *  - 该翻译器属于接口层 / ACL，绝不能进入 domain 包。
 *  - 返回的 AuthorizePaymentCommand 已通过所有构造期校验，可以直接交给 handler。
 */
object CheckoutToPaymentTranslator {

    fun translate(request: CheckoutRequest): AuthorizePaymentCommand {
        val paymentId = parsePaymentId(request.paymentId)
        val currency = parseCurrency(request.currency)
        val amount = parseAmount(request.amount, currency)
        val orderReference = parseOrderReference(request.orderReference)

        return AuthorizePaymentCommand(
            paymentId = paymentId,
            orderReference = orderReference,
            amount = amount,
            description = request.description
        )
    }

    private fun parsePaymentId(raw: String): PaymentId {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) {
            throw CheckoutTranslationException("paymentId 不能为空")
        }
        return PaymentId.of(trimmed)
    }

    private fun parseOrderReference(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) {
            throw CheckoutTranslationException("orderReference 不能为空")
        }
        return trimmed
    }

    private fun parseCurrency(raw: String): Currency {
        val trimmed = raw.trim().uppercase()
        val currency = Currency.fromCode(trimmed)
            ?: throw CheckoutTranslationException("不支持的币种: $raw")
        return currency
    }

    private fun parseAmount(raw: String, currency: Currency): Money {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) {
            throw CheckoutTranslationException("amount 不能为空")
        }
        val decimal = try {
            BigDecimal(trimmed)
        } catch (ex: NumberFormatException) {
            throw CheckoutTranslationException("金额格式非法: $raw")
        }
        if (decimal.signum() <= 0) {
            throw CheckoutTranslationException("金额必须为正数: $raw")
        }
        try {
            return Money.of(currency, decimal)
        } catch (ex: IllegalArgumentException) {
            throw CheckoutTranslationException(
                ex.message ?: "金额无效: $raw"
            )
        }
    }
}

/**
 * 翻译失败时抛出。绝不暴露内部异常 / 错误码给上游。
 */
class CheckoutTranslationException(message: String) : RuntimeException(message) {

    companion object {
        /** 把翻译异常映射为领域异常（如果合适），保持调用栈干净。 */
        fun rethrowAsDomainError(ex: CheckoutTranslationException): Nothing {
            if (ex.message?.contains("金额") == true) {
                throw InvalidPaymentAmountException(ex.message ?: "金额无效")
            }
            throw ex
        }
    }
}