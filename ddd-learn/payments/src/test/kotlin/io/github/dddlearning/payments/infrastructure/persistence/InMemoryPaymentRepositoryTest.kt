package io.github.dddlearning.payments.infrastructure.persistence

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.port.IdGenerator
import io.github.dddlearning.payments.domain.model.ExternalPaymentId
import io.github.dddlearning.payments.domain.model.Payment
import io.github.dddlearning.payments.domain.model.PaymentId
import io.github.dddlearning.payments.domain.model.PaymentStatus
import io.github.dddlearning.payments.domain.repository.OptimisticLockException
import io.github.dddlearning.value.Currency
import io.github.dddlearning.value.Money
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.math.BigDecimal
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * InMemoryPaymentRepository 的并发 / 幂等语义测试。
 *
 * 覆盖：
 *  - 首次保存：version 从 0 → 1
 *  - 期望版本不匹配 → OptimisticLockException
 *  - findActiveByOrderReference 不返回终态
 *  - 同一 orderReference 终态后可以创建新支付（去重只对活跃状态生效）
 */
class InMemoryPaymentRepositoryTest {

    private val fixedId = object : IdGenerator<EventId> {
        override fun nextId(): EventId = EventId("evt-x")
    }

    private fun repo(): InMemoryPaymentRepository =
        InMemoryPaymentRepository(eventIdGen = fixedId, clock = java.time.Clock.systemUTC())

    private fun newPending(repo: InMemoryPaymentRepository, ref: String, id: String = "pay-$ref"): Payment {
        val p = Payment.create(
            paymentId = PaymentId.of(id),
            orderReference = ref,
            amount = Money.of(Currency.USD, BigDecimal("50.00")),
            eventIdGen = fixedId,
            clock = { java.time.Instant.now() }
        )
        return repo.save(p, expectedVersion = 0L)
    }

    // ---------- 基本 CRUD ----------

    @Test
    fun `save new payment succeeds and assigns version 0`() {
        val repo = repo()
        val saved = newPending(repo, "ORDER-1", "pay-1")
        assertEquals(0L, saved.version)
        assertEquals(1, repo.size())

        val loaded = repo.findById(PaymentId.of("pay-1"))
        assertNotNull(loaded)
        assertEquals(PaymentStatus.Pending, loaded.status)
    }

    @Test
    fun `save existing payment increments version`() {
        val repo = repo()
        val saved = newPending(repo, "ORDER-1", "pay-1")
        saved.markAuthorized(ExternalPaymentId.of("ext-1"))
        val reSaved = repo.save(saved, expectedVersion = 0L)
        assertEquals(1L, reSaved.version)
    }

    @Test
    fun `findById returns null for unknown payment`() {
        val repo = repo()
        assertNull(repo.findById(PaymentId.of("missing")))
    }

    // ---------- 乐观锁 ----------

    @Test
    fun `save throws OptimisticLockException when expectedVersion mismatches`() {
        val repo = repo()
        newPending(repo, "ORDER-1", "pay-1")

        // 第一次：version 0 → 1
        val p1 = repo.findById(PaymentId.of("pay-1"))!!
        p1.markAuthorized(ExternalPaymentId.of("ext-1"))
        repo.save(p1, expectedVersion = 0L)

        // 从第一次保存前持有的快照模拟并发写入；其版本仍为 0 且状态仍为 Pending。
        val stale = Payment.create(
            PaymentId.of("pay-1"),
            "ORDER-1",
            Money.of(Currency.USD, BigDecimal("50.00")),
            fixedId,
            { java.time.Instant.now() },
        )
        stale.markAuthorized(ExternalPaymentId.of("ext-2"))

        val ex = assertThrows<OptimisticLockException> {
            repo.save(stale, expectedVersion = 0L)
        }
        assertEquals(0L, ex.expectedVersion)
        assertEquals(1L, ex.actualVersion)
        assertEquals(PaymentId.of("pay-1"), ex.paymentId)
    }

    @Test
    fun `save rejects new payment with non-zero expected version`() {
        val repo = repo()
        val payment = Payment.create(
            PaymentId.of("pay-new"),
            "ORDER-NEW",
            Money.of(Currency.USD, BigDecimal("1.00")),
            fixedId,
            { java.time.Instant.now() }
        )
        val ex = assertThrows<OptimisticLockException> {
            repo.save(payment, expectedVersion = 5L)
        }
        assertEquals(5L, ex.expectedVersion)
        assertEquals(0L, ex.actualVersion)
    }

    // ---------- 业务键去重 ----------

    @Test
    fun `findActiveByOrderReference finds non-terminal payment`() {
        val repo = repo()
        newPending(repo, "ORDER-A", "pay-A")
        val found = repo.findActiveByOrderReference("ORDER-A")
        assertNotNull(found)
        assertEquals("pay-A", found.id.value)
    }

    @Test
    fun `findActiveByOrderReference excludes Failed payment`() {
        val repo = repo()
        val saved = newPending(repo, "ORDER-A", "pay-A")
        saved.markFailed("DECLINED")
        repo.save(saved, expectedVersion = 0L)

        val found = repo.findActiveByOrderReference("ORDER-A")
        assertNull(found, "终态 FAILED 不应被 findActiveByOrderReference 返回")
    }

    @Test
    fun `findActiveByOrderReference excludes Refunded payment`() {
        val repo = repo()
        var saved = newPending(repo, "ORDER-A", "pay-A")
        saved.markAuthorized(ExternalPaymentId.of("ext-1"))
        saved = repo.save(saved, expectedVersion = 0L)
        saved.markCaptured()
        saved = repo.save(saved, expectedVersion = 1L)
        saved.markRefunded(saved.amount)
        repo.save(saved, expectedVersion = 2L)

        val found = repo.findActiveByOrderReference("ORDER-A")
        assertNull(found, "终态 REFUNDED 不应被 findActiveByOrderReference 返回")
    }

    @Test
    fun `findActiveByOrderReference returns Authorized payment`() {
        val repo = repo()
        val saved = newPending(repo, "ORDER-A", "pay-A")
        saved.markAuthorized(ExternalPaymentId.of("ext-1"))
        repo.save(saved, expectedVersion = 0L)

        val found = repo.findActiveByOrderReference("ORDER-A")
        assertNotNull(found)
        assertEquals(PaymentStatus.Authorized, found.status)
    }

    @Test
    fun `findActiveByOrderReference returns null for unknown reference`() {
        val repo = repo()
        assertNull(repo.findActiveByOrderReference("MISSING"))
    }

    // ---------- 隔离性 ----------

    @Test
    fun `returned payment snapshot is independent of stored aggregate`() {
        val repo = repo()
        newPending(repo, "ORDER-A", "pay-A")
        val snapshot = repo.findById(PaymentId.of("pay-A"))!!

        // 改动 snapshot 不影响仓储
        snapshot.markAuthorized(ExternalPaymentId.of("ext-modified"))
        val reread = repo.findById(PaymentId.of("pay-A"))!!
        assertEquals(PaymentStatus.Pending, reread.status)
    }

    @Test
    fun `deleteAll clears all payments`() {
        val repo = repo()
        newPending(repo, "ORDER-A", "pay-A")
        newPending(repo, "ORDER-B", "pay-B")
        assertEquals(2, repo.size())

        repo.deleteAll()
        assertEquals(0, repo.size())
    }
}