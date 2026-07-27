package io.github.dddlearning.messaging

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import java.time.Instant

/**
 * Transport-ready wrapper around a [DomainEvent].
 *
 * DDD role: an envelope carries the metadata a transport (broker, outbox, log) needs to deliver
 * a domain event without inspecting its payload — the message id for idempotency, the
 * occurred-at timestamp for ordering, and the fully-qualified event type for routing.
 *
 * Envelopes are immutable. Callers that need to record one durably should construct it once and
 * store it as-is; re-wrapping the same event must produce envelopes with distinct ids.
 *
 * @property messageId identifier of this delivery; used for idempotency at the consumer side.
 *   By default equals the event's own [DomainEvent.eventId].
 * @property eventType fully-qualified class name of the contained event; used by the broker for
 *   topic routing and by the consumer for deserialisation.
 * @property occurredAt the instant the event occurred in the domain.
 * @property payload the domain event itself.
 */
data class EventEnvelope(
    val messageId: EventId,
    val eventType: String,
    val occurredAt: Instant,
    val payload: DomainEvent,
) {
    companion object {
        /** Wraps [event] using its own [DomainEvent.eventId] as the message id. */
        fun of(event: DomainEvent): EventEnvelope = EventEnvelope(
            messageId = event.eventId,
            eventType = event::class.qualifiedName ?: error("anonymous domain event"),
            occurredAt = event.occurredAt,
            payload = event,
        )
    }
}