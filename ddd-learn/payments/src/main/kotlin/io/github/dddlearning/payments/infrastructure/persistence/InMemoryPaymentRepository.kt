package io.github.dddlearning.payments.infrastructure.persistence

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.inmemory.UuidIdGenerator
import io.github.dddlearning.payments.domain.model.Payment
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.payments.domain.model.PaymentStatus
import io.github.dddlearning.payments.domain.repository.OptimisticLockException
import io.github.dddlearning.payments.domain.repository.PaymentRepository
import io.github.dddlearning.payments.domain.repository.activePaymentStatuses
import java.time.Clock
import java.time.Instant

/**
 * 内存版 Payment 仓储实现。仅用于开发 / 测试 / 单进程演示。
 * 提供乐观锁语义（基于 [Payment.version]），与真实数据库的乐观锁语义一致。
 *
 * 关键不变量：
 *  - 仓储内部存储 Payment 快照（id → record）。
 *  - save(expectedVersion) 校验传入版本与已存版本匹配，否则抛出 OptimisticLockException。
 *  - 业务键去重：findActiveByOrderReference 排除 FAILED / REFUNDED 终态。
 *
 * 注意：本实现只为演示；事件流与发布者由调用方处理（handler 显式调用 outbox / publisher）。
 */
class InMemoryPaymentRepository(
    private val eventIdGen: IdGenerator<EventId> = UuidIdGenerator,
    private val clock: Clock = Clock.systemUTC()
) : PaymentRepository {

    /** 内部记录：版本号、领域事件快照。 */
    private data class Entry(
        val payment: Payment,
        val version: Long
    )

    private val store: MutableMap<PaymentId, Entry> = mutableMapOf()

    override fun findById(id: PaymentId): Payment? =
        store[id]?.let { clone(it.payment) }

    override fun findActiveByOrderReference(orderReference: String): Payment? =
        store.values
            .map { it.payment }
            .firstOrNull { payment ->
                payment.orderReference == orderReference &&
                    payment.status in activePaymentStatuses
            }
            ?.let { clone(it) }

    override fun save(payment: Payment, expectedVersion: Long): Payment {
        val current = store[payment.id]
        if (current == null) {
            if (expectedVersion != 0L) {
                // 新建但期望版本不是 0 → 说明存在并发竞争，调用方不应这么做
                throw OptimisticLockException(payment.id, expectedVersion, actualVersion = 0L)
            }
            val stored = clone(payment)
            store[payment.id] = Entry(stored, version = stored.version)
            return clone(stored)
        }

        if (current.version != expectedVersion) {
            throw OptimisticLockException(
                paymentId = payment.id,
                expectedVersion = expectedVersion,
                actualVersion = current.version
            )
        }

        val stored = clone(payment)
        store[payment.id] = Entry(stored, version = stored.version)
        return clone(stored)
    }

    override fun deleteAll() {
        store.clear()
    }

    /** 用于断言 / 测试：当前仓储内的 payment 数量（不去重）。 */
    fun size(): Int = store.size

    /** 用于断言 / 测试：取所有非终态支付。 */
    fun findAll(): List<Payment> = store.values.map { clone(it.payment) }

    /**
     * 克隆 Payment 以保证仓储内的对象不被外部修改。
     * 由于 Payment 是引用对象且内部方法会变更状态，仓储层应保持不可共享的快照。
     * 这里通过 reflection-free 浅拷贝（Payment 无内部可变状态之外的对象）简化实现。
     */
    private fun clone(p: Payment): Payment = Payment.rehydrate(
        id = p.id,
        orderReference = p.orderReference,
        amount = p.amount,
        status = p.status,
        externalPaymentId = p.externalPaymentId,
        version = p.version,
        eventIdGen = eventIdGen,
        clock = { clock.instant() }
    )
}
