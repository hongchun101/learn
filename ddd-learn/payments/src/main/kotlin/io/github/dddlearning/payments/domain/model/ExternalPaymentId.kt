package io.github.dddlearning.payments.domain.model

/**
 * 外部支付网关（如 Stripe / 支付宝）返回的支付标识符。
 * 由 PaymentGateway 在授权成功后产生；领域内引用但由基础设施解释。
 */
data class ExternalPaymentId(val value: String) {
    init {
        require(value.isNotBlank()) { "ExternalPaymentId 必须为非空字符串" }
    }

    override fun toString(): String = "ExternalPaymentId($value)"

    companion object {
        fun of(value: String): ExternalPaymentId = ExternalPaymentId(value)
    }
}