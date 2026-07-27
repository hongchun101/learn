package io.github.dddlearning.domain

import java.time.Instant

/**
 * Marker for a domain event.
 *
 * Domain events are facts produced by the domain when an aggregate's invariants change. They are
 * named in the past tense (e.g. `OrderPlaced`) and carry all the data subscribers need to react.
 *
 * Implementations MUST be immutable value objects: every property must be `val` and the type
 * itself must be either a `data class` or composed of immutable types. Two events with identical
 * data represent the same fact.
 *
 * @see AggregateRoot
 */
interface DomainEvent {
    /** Unique identifier of this event occurrence. */
    val eventId: EventId

    /** Wall-clock instant when the fact occurred in the domain. */
    val occurredAt: Instant
}