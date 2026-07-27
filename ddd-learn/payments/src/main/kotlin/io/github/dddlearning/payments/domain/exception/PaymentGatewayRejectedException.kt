package io.github.dddlearning.payments.domain.exception

/**
 * 网关拒绝了授权请求（例如余额不足、风控拒绝、网关超时）。
 * 应用层捕获后将其转换为 PaymentFailed 事件，并保留 reason 给消费方排查。
 */
class PaymentGatewayRejectedException(
    val reasonCode: String,
    val description: String
) : RuntimeException("网关拒绝支付: $reasonCode ($description)")