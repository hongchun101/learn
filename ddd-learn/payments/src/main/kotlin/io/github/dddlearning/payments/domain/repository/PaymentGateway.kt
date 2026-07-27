package io.github.dddlearning.payments.domain.repository

import io.github.dddlearning.payments.domain.model.ExternalPaymentId
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.value.Money

/**
 * 网关请求 / 响应 / 异常构成"防腐层"（Anti-Corruption Layer）的内部模型。
 * 它们是网关侧的通用语言，与具体网关（Stripe / 支付宝等）解耦；
 * 由翻译器（Translator）把外部概念转换进来。
 */
data class GatewayChargeRequest(
    /** 支付聚合根 ID。用于网关侧审计追踪，与业务幂等键不同。 */
    val paymentId: PaymentId,
    /** 业务幂等键：通常来自订单引用。同一键的重复请求网关会视为同一笔。 */
    val idempotencyKey: String,
    /** 授权金额。 */
    val amount: Money,
    /** 可选描述（订单号、买家备注等）。 */
    val description: String?
)

/**
 * 网关授权成功响应。
 */
data class GatewayAuthorization(
    val externalPaymentId: ExternalPaymentId,
    val authorizedAmount: Money
)

/**
 * 网关明确拒绝的语义。
 *  - [DECLINED]          用户 / 银行主动拒绝
 *  - [INSUFFICIENT_FUNDS]余额不足
 *  - [INVALID_REQUEST]   请求格式错误（如币种不被支持）
 *  - [GATEWAY_UNAVAILABLE] 网关暂时不可用（网络 / 5xx）
 *  - [UNKNOWN]           未归类错误
 */
enum class GatewayDeclineReason {
    DECLINED,
    INSUFFICIENT_FUNDS,
    INVALID_REQUEST,
    GATEWAY_UNAVAILABLE,
    UNKNOWN
}

/**
 * 网关拒绝授权的领域化异常。
 */
class GatewayRejectionException(
    val reason: GatewayDeclineReason,
    message: String
) : RuntimeException(message)

/**
 * 支付网关端口（出站端口）。领域层通过它发起授权 / 结算 / 退款。
 * 适配器可以是 Fake / Stripe / Alipay，但接口对领域层完全稳定。
 *
 * 接口语义：
 *  - [authorize]   必须满足幂等性（同一 idempotencyKey 多次调用，结果一致）。
 *  - [capture]     把一笔已授权的资金结算入账。
 *  - [refund]      退款（部分或全额）。
 *  - 所有方法都必须把网关异常翻译为上述领域异常；绝不向上抛具体 SDK 异常。
 */
interface PaymentGateway {
    fun authorize(request: GatewayChargeRequest): GatewayAuthorization
    fun capture(externalPaymentId: ExternalPaymentId, amount: Money): GatewayAuthorization
    fun refund(externalPaymentId: ExternalPaymentId, amount: Money): GatewayAuthorization
}