package io.github.dddlearning.payments.domain.model

/**
 * 支付的显式状态机。状态转换只能由 Payment 聚合内部方法触发，
 * 外部代码不可以直接将 Payment 置于某个状态。
 *
 * 状态语义：
 *  - PENDING       已创建尚未授权
 *  - AUTHORIZED    网关已授权，但尚未结算
 *  - CAPTURED      已结算完成，资金到账
 *  - FAILED        授权失败，钱包 / 余额不足 / 风控拒绝等
 *  - REFUNDED      已退款（全额或部分）
 */
sealed class PaymentStatus {
    object Pending : PaymentStatus()
    object Authorized : PaymentStatus()
    object Captured : PaymentStatus()
    object Failed : PaymentStatus()
    object Refunded : PaymentStatus()

    override fun toString(): String = javaClass.simpleName
}