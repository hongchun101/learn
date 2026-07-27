package io.github.dddlearning.payments.domain.model

/**
 * 支付聚合根标识符。支付上下文中每个 Payment 都有自己的 PaymentId，
 * 通过 IdGenerator<PaymentId> 在外部生成（保证确定性）。
 */
data class PaymentId(val value: String) {
    init {
        require(value.isNotBlank()) { "PaymentId 必须为非空字符串" }
    }

    override fun toString(): String = "PaymentId($value)"

    companion object {
        fun of(value: String): PaymentId = PaymentId(value)
    }
}