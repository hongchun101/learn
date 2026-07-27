package io.github.dddlearning.payments.infrastructure.gateway

import io.github.dddlearning.payments.domain.model.ExternalPaymentId
import io.github.dddlearning.payments.domain.repository.GatewayAuthorization
import io.github.dddlearning.payments.domain.repository.GatewayChargeRequest
import io.github.dddlearning.payments.domain.repository.GatewayDeclineReason
import io.github.dddlearning.payments.domain.repository.GatewayRejectionException
import io.github.dddlearning.payments.domain.repository.PaymentGateway
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import java.math.BigDecimal
import java.util.concurrent.atomic.AtomicLong

/**
 * 确定性假网关实现。
 *
 * 行为：
 *  - 严格的幂等性：同一 idempotencyKey 的多次 authorize 调用都返回同一结果（首次决定）。
 *  - 行为通过 [Behavior] 注入：
 *      * [Behavior.ApproveAll]               全部授权成功
 *      * [Behavior.RejectAll]                全部拒绝（DECLINED）
 *      * [Behavior.RejectAbove(amount)]      超过阈值的金额拒绝
 *      * [Behavior.RejectCurrency(currency)] 指定币种拒绝
 *      * [Behavior.RejectKeyPrefix(prefix)]   指定幂等键前缀拒绝
 *      * [Behavior.Custom(fn)]               自定义判定
 *  - generateExternalId 模式：按 (idempotencyKey) 稳定生成 ExternalPaymentId。
 *
 * 该实现仅用于领域驱动设计的演示与单元测试，**绝不** 应用于生产环境。
 */
class DeterministicFakePaymentGateway(
    private val behavior: Behavior = Behavior.ApproveAll
) : PaymentGateway {

    private val counter = AtomicLong(0L)
    private val seen: MutableMap<String, GatewayAuthorization> = mutableMapOf()
    private val declines: MutableMap<String, GatewayDeclineReason> = mutableMapOf()

    sealed class Behavior {
        object ApproveAll : Behavior()
        object RejectAll : Behavior()
        data class RejectAbove(val threshold: Money) : Behavior()
        data class RejectCurrency(val currency: Currency) : Behavior()
        data class RejectKeyPrefix(val prefix: String) : Behavior()
        data class RejectKeyContaining(val substring: String) : Behavior()
        data class RejectReason(val reason: GatewayDeclineReason) : Behavior()
        data class Custom(val decide: (GatewayChargeRequest) -> GatewayDeclineReason?) : Behavior()
    }

    override fun authorize(request: GatewayChargeRequest): GatewayAuthorization {
        counter.incrementAndGet()
        seen[request.idempotencyKey]?.let { return it }

        val decline = decide(request)
        if (decline != null) {
            declines[request.idempotencyKey] = decline
            throw GatewayRejectionException(
                reason = decline,
                message = "网关拒绝 (idempotencyKey=${request.idempotencyKey}, reason=$decline)"
            )
        }

        val extId = ExternalPaymentId.of(
            "ext-${request.idempotencyKey}-${request.paymentId.value}"
        )
        val authorization = GatewayAuthorization(
            externalPaymentId = extId,
            authorizedAmount = request.amount
        )
        seen[request.idempotencyKey] = authorization
        return authorization
    }

    override fun capture(externalPaymentId: ExternalPaymentId, amount: Money): GatewayAuthorization =
        GatewayAuthorization(externalPaymentId = externalPaymentId, authorizedAmount = amount)

    override fun refund(externalPaymentId: ExternalPaymentId, amount: Money): GatewayAuthorization =
        GatewayAuthorization(externalPaymentId = externalPaymentId, authorizedAmount = amount)

    private fun decide(request: GatewayChargeRequest): GatewayDeclineReason? = when (val b = behavior) {
        Behavior.ApproveAll -> null
        Behavior.RejectAll -> GatewayDeclineReason.DECLINED
        is Behavior.RejectAbove ->
            if (request.amount.compareTo(b.threshold) > 0) GatewayDeclineReason.DECLINED else null
        is Behavior.RejectCurrency ->
            if (request.amount.currency == b.currency) GatewayDeclineReason.DECLINED else null
        is Behavior.RejectKeyPrefix ->
            if (request.idempotencyKey.startsWith(b.prefix)) GatewayDeclineReason.DECLINED else null
        is Behavior.RejectKeyContaining ->
            if (request.idempotencyKey.contains(b.substring)) GatewayDeclineReason.DECLINED else null
        is Behavior.RejectReason -> b.reason
        is Behavior.Custom -> b.decide(request)
    }

    // ---------- 测试断言辅助 ----------

    /** Number of authorize invocations, including repeated idempotency keys. */
    fun authorizeCallCount(): Long = counter.get()

    /** 已记录的（成功）幂等键集合。 */
    fun approvedKeys(): Set<String> = seen.keys

    /** 已记录的拒绝幂等键集合。 */
    fun declinedKeys(): Set<String> = declines.keys

    /** 通过金额比较创建 RejectAbove 行为的便捷方法。 */
    companion object {
        fun rejectAbove(currency: Currency, amount: BigDecimal): Behavior =
            Behavior.RejectAbove(Money.of(currency, amount))
    }
}