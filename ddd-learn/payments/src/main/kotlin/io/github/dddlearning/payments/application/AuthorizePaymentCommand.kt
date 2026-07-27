package io.github.dddlearning.payments.application

import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.value.Money

/**
 * 授权支付的应用命令。
 *
 * 该命令是应用层（用例）的输入。它由一个通用 checkout 流程的
 * 翻译器（[AuthorizePaymentCommandFactory]）构造，承接任意来源
 * 的下单数据；本命令只承载支付上下文所需的字段。
 *
 * 幂等性：
 *  - [orderReference] 充当业务幂等键。
 *  - 同一 orderReference + currency 在系统中只能存在一笔活跃支付。
 *  - 重复提交该命令不会产生新支付，也不会再次调用网关。
 */
data class AuthorizePaymentCommand(
    /** 支付聚合根 ID，由调用方注入（确定性要求）。 */
    val paymentId: PaymentId,
    /** 业务幂等键（订单引用）。 */
    val orderReference: String,
    /** 待授权金额（含币种）。 */
    val amount: Money,
    /** 可选描述，透传至网关。 */
    val description: String? = null
) {
    init {
        require(orderReference.isNotBlank()) { "orderReference 必须为非空字符串" }
    }
}

/**
 * 命令结果：
 *  - [Created]   新支付已创建并发出 PaymentAuthorized 事件
 *  - [Duplicate] 检测到相同业务键的活跃支付，跳过重复授权
 */
sealed class AuthorizePaymentResult {
    data class Created(val paymentId: PaymentId) : AuthorizePaymentResult()
    data class Duplicate(val existingPaymentId: PaymentId) : AuthorizePaymentResult()
}