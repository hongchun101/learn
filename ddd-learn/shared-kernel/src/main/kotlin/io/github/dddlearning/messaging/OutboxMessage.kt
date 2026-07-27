package io.github.dddlearning.messaging

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import java.time.Instant

/**
 * Lifecycle states of an [OutboxMessage] inside the transactional outbox.
 *
 * The outbox guarantees that a domain event is published to the broker at-least-once by storing
 * it in the same transaction as the aggregate's state change, then handing it off to a relay
 * process that publishes it. The relay marks messages [PUBLISHED] only after the broker has
 * acknowledged the write.
 *
 * - [PENDING]  — message has been enqueued by the application layer; the relay may publish it.
 * - [PUBLISHED] — the relay has confirmed delivery; the message may be archived or deleted.
 */
enum class OutboxStatus { PENDING, PUBLISHED }

/**
 * A message durably stored in the outbox awaiting publication.
 *
 * @property messageId unique identifier of this delivery; the relay uses it to mark the row
 *   published and downstream consumers use it for idempotency. By convention equals the event's
 *   own [DomainEvent.eventId].
 * @property eventType fully-qualified class name of the contained event.
 * @property occurredAt the instant the event occurred in the domain.
 * @property status current lifecycle state.
 * @property payload the domain event itself.
 */
data class OutboxMessage(
    val messageId: EventId,
    val eventType: String,
    val occurredAt: Instant,
    val status: OutboxStatus,
    val payload: DomainEvent,
)

/**
 * Transactional outbox port.
 *
 * The application layer writes outbox messages in the same transaction as the aggregate's state
 * change. A separate relay drains the outbox and forwards messages to the broker. This decouples
 * the domain from any external messaging system and is the canonical reliability pattern for
 * DDD applications.
 *
 * Implementations MUST be safe to call from inside an active transaction — typically the outbox
 * row is written through the same JDBC connection as the aggregate state change.
 */
interface Outbox {
    /** Enqueues [envelope] for publication. */
    fun enqueue(envelope: EventEnvelope)

    /**
     * Returns all [OutboxStatus.PENDING] messages in the order they were enqueued.
     *
     * The returned list is a snapshot; the relay may iterate it without holding any lock.
     */
    fun pending(): List<OutboxMessage>

    /**
     * Marks the message identified by [messageId] as [OutboxStatus.PUBLISHED]. Idempotent:
     * marking an already-published message (or a missing one) is a no-op.
     */
    fun markPublished(messageId: EventId)

    /** Returns the current message for [messageId], or `null` if none exists. */
    fun find(messageId: EventId): OutboxMessage?
}