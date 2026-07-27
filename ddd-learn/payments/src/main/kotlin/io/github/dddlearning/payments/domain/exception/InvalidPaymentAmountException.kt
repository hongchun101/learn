package io.github.dddlearning.payments.domain.exception

/**
 * 支付金额校验失败。例如：金额为 0、为负、币种与订单要求不一致。
 */
class InvalidPaymentAmountException(message: String) : IllegalArgumentException(message)