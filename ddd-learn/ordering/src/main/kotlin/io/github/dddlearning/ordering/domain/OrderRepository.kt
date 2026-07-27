package io.github.dddlearning.ordering.domain

import io.github.dddlearning.reliability.OptimisticLockingException
import java.util.concurrent.ConcurrentHashMap

interface OrderRepository {
    fun findById(id: OrderId): Order?

    /** Saves a new order or replaces the snapshot whose version equals [expectedVersion]. */
    fun save(order: Order, expectedVersion: Long = order.version)
}

class OrderNotFoundException(id: OrderId) : NoSuchElementException("Order $id was not found")

/** Thread-safe snapshot repository; callers never share the stored mutable aggregate instance. */
class InMemoryOrderRepository : OrderRepository {
    private data class Snapshot(
        val id: OrderId,
        val customerId: CustomerId,
        val currency: io.github.dddlearning.value.Currency,
        val status: OrderStatus,
        val lines: List<OrderLine>,
        val version: Long,
    )

    private val snapshots = ConcurrentHashMap<OrderId, Snapshot>()

    override fun findById(id: OrderId): Order? = snapshots[id]?.toOrder()

    override fun save(order: Order, expectedVersion: Long) {
        require(expectedVersion >= 0) { "Expected version must not be negative" }
        synchronized(snapshots) {
            val stored = snapshots[order.id]
            if (stored == null) {
                if (expectedVersion != 0L || order.version != 0L) {
                    throw OptimisticLockingException("Order", order.id, expectedVersion, 0)
                }
            } else if (stored.version != expectedVersion) {
                throw OptimisticLockingException("Order", order.id, expectedVersion, stored.version)
            }

            val newVersion = expectedVersion + 1
            snapshots[order.id] = Snapshot(
                id = order.id,
                customerId = order.customerId,
                currency = order.currency,
                status = order.status,
                lines = order.lines,
                version = newVersion,
            )
            order.version = newVersion
        }
    }

    fun clear() = snapshots.clear()

    private fun Snapshot.toOrder(): Order = Order.reconstitute(
        id = id,
        customerId = customerId,
        currency = currency,
        status = status,
        lines = lines,
        version = version,
    )
}
