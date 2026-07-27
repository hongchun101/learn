package io.github.dddlearning.payments.domain.exception

import io.github.dddlearning.payments.domain.model.PaymentStatus

/**
 * 试图在一个不被允许的支付状态下执行某个动作。
 * 例如：试图对已 CAPTURED 的支付再次 capture，或对 FAILED 的支付发起退款。
 */
class InvalidPaymentStateException(
    val currentStatus: PaymentStatus,
    action: String,
    reason: String? = null
) : IllegalStateException(buildMessage(currentStatus, action, reason)) {

    private companion object {
        fun buildMessage(status: PaymentStatus, action: String, reason: String?): String =
            if (reason == null) {
                "无法在状态 ${status} 下执行操作 $action"
            } else {
                "无法在状态 ${status} 下执行操作 $action: $reason"
            }
    }
}