package io.github.dddlearning.payments.domain.repository

import io.github.dddlearning.payments.domain.model.Payment
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.payments.domain.model.PaymentStatus
import io.github.dddlearning.value.Currency

/**
 * 支付仓储端口（出站端口）。领域层不依赖任何 ORM / 数据库；
 * 基础设施提供 in-memory 或关系型实现。
 *
 * 关键约束：
 *  - 仓储必须保留版本号，并在保存冲突时抛出 [OptimisticLockException]。
 *  - 所有查找/保存操作对 Payment 聚合的内部状态不可见。
 */
interface PaymentRepository {

    /**
     * 通过 [PaymentId] 加载聚合根；找不到时返回 null。
     */
    fun findById(id: PaymentId): Payment?

    /**
     * 通过业务幂等键查找活跃支付。
     * "活跃" 指状态不是终态（FAILED / REFUNDED）。
     * 用于去重：同一订单 + 同一币种的非终态支付最多一笔。
     */
    fun findActiveByOrderReference(orderReference: String): Payment?

    /**
     * 保存聚合根并自增版本号。
     * 如果传入的 expectedVersion 与已存版本不一致，抛出 [OptimisticLockException]。
     * 注意：返回的 Payment 反映的是新版本号。
     */
    fun save(payment: Payment, expectedVersion: Long): Payment

    /**
     * 删除全部数据（仅供测试或重新构建场景使用）。
     */
    fun deleteAll()
}

/**
 * 乐观锁冲突异常。仓储实现在版本号不匹配时抛出此异常，
 * 表明聚合根已被另一事务/线程修改，当前操作应中止或重试。
 */
class OptimisticLockException(
    val paymentId: PaymentId,
    val expectedVersion: Long,
    val actualVersion: Long
) : RuntimeException(
    "Payment ${paymentId.value} 乐观锁冲突: 期望版本 $expectedVersion, 实际 $actualVersion"
)

/**
 * 复合幂等键：订单引用 + 货币。同一键下只能存在一笔活跃支付。
 */
data class PaymentBusinessKey(val orderReference: String, val currency: Currency) {
    init {
        require(orderReference.isNotBlank()) { "orderReference 必须为非空字符串" }
    }

    val currencyCode: String get() = currency.code
}

/**
 * 便捷过滤：哪些状态属于"活跃"（非终态）。终态不会被 findActiveByOrderReference 返回。
 */
val activePaymentStatuses: Set<PaymentStatus> = setOf(
    PaymentStatus.Pending,
    PaymentStatus.Authorized,
    PaymentStatus.Captured
)