package io.github.dddlearning.inmemory

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.messaging.EventEnvelope
import io.github.dddlearning.messaging.Outbox
import io.github.dddlearning.messaging.OutboxMessage
import io.github.dddlearning.messaging.OutboxStatus

/**
 * In-memory [Outbox] for tests and process-local wiring.
 *
 * Insertion order is preserved. This implementation is single-threaded by construction (no
 * locking); concurrent use from multiple threads is not supported.
 */
class InMemoryOutbox : Outbox {

    private val messages: MutableList<OutboxMessage> = mutableListOf()

    override fun enqueue(envelope: EventEnvelope) {
        messages.add(
            OutboxMessage(
                messageId = envelope.messageId,
                eventType = envelope.eventType,
                occurredAt = envelope.occurredAt,
                status = OutboxStatus.PENDING,
                payload = envelope.payload,
            ),
        )
    }

    override fun pending(): List<OutboxMessage> =
        messages.filter { it.status == OutboxStatus.PENDING }.toList()

    override fun markPublished(messageId: EventId) {
        val idx = messages.indexOfFirst { it.messageId == messageId }
        if (idx < 0) return
        messages[idx] = messages[idx].copy(status = OutboxStatus.PUBLISHED)
    }

    override fun find(messageId: EventId): OutboxMessage? =
        messages.firstOrNull { it.messageId == messageId }

    /** Returns a snapshot of every message, regardless of status. Useful for assertions. */
    fun all(): List<OutboxMessage> = messages.toList()

    /** Removes all messages. Intended for test setup. */
    fun reset() {
        messages.clear()
    }
}