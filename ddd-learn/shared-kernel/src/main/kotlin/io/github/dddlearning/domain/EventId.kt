package io.github.dddlearning.domain

/**
 * Strongly typed identifier for a domain event.
 *
 * In DDD terms, an [EventId] makes each domain event individually addressable and is the key the
 * [io.github.dddlearning.messaging.ProcessedMessageStore] uses to enforce idempotency. Wrapping the
 * raw [String] in a value object prevents accidental mix-ups with other identifiers (aggregate ids,
 * command ids, etc.).
 *
 * @property value opaque identifier string; never empty.
 */
@JvmInline
value class EventId(val value: String) {
    init {
        require(value.isNotBlank()) { "EventId value must not be blank" }
    }

    /** Returns the underlying string form. Provided for serialization boundaries only. */
    override fun toString(): String = value
}