package io.github.dddlearning.payments.domain.exception

import io.github.dddlearning.payments.domain.model.PaymentId

/**
 * 同一业务键（订单引用 + 货币）已存在另一笔非终态 Payment 时抛出。
 * 用于防止对同一订单重复扣款（幂等性保护）。
 */
class DuplicatePaymentException(
    val orderReference: String,
    val currencyCode: String,
    val existingPaymentId: PaymentId
) : IllegalStateException(
    "订单 $orderReference 在 $currencyCode 下已存在 Payment ${existingPaymentId.value}"
)