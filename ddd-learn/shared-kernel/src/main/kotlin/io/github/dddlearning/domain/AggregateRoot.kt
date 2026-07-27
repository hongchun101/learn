package io.github.dddlearning.domain

/**
 * Base class for a DDD aggregate root.
 *
 * An aggregate root is the only member of an aggregate that external actors (application
 * services, other aggregates) may hold a reference to. Internally it enforces all invariants of
 * its consistency boundary and is the only place that may raise domain events in response to a
 * state change.
 *
 * Subclasses call [raise] from inside their behaviour methods to record facts. The events are
 * retained until [pullDomainEvents] is called by the application layer — typically inside the
 * same transaction that persisted the new state — at which point the caller is expected to
 * publish them via [io.github.dddlearning.port.DomainEventPublisher] (often via a transactional
 * outbox).
 *
 * @param ID the type of the aggregate's identity.
 * @property id the aggregate's identifier; required for equality.
 */
abstract class AggregateRoot<ID : Any>(val id: ID) {

    private val domainEvents: MutableList<DomainEvent> = ArrayList()

    /**
     * Records [event] as having occurred on this aggregate. Only callable from inside subclasses
     * (the `protected` modifier is the visibility boundary DDD prescribes for event creation).
     */
    protected fun raise(event: DomainEvent) {
        domainEvents.add(event)
    }

    /**
     * Returns the events raised since the last call, in the order they were raised, and clears
     * the internal buffer. Calling on an aggregate with no pending events returns an empty list.
     */
    fun pullDomainEvents(): List<DomainEvent> {
        if (domainEvents.isEmpty()) return emptyList()
        val snapshot = ArrayList<DomainEvent>(domainEvents)
        domainEvents.clear()
        return snapshot
    }

    /**
     * Returns the events raised so far without clearing the buffer. Intended for diagnostics and
     * tests; production code MUST use [pullDomainEvents] so events cannot be replayed twice.
     */
    fun peekDomainEvents(): List<DomainEvent> = domainEvents.toList()

    /**
     * Two aggregates are equal iff they have the same [id] and the same concrete type. This is the
     * canonical identity-based equality for DDD aggregates.
     */
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other == null || other::class != this::class) return false
        other as AggregateRoot<*>
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()

    override fun toString(): String = "${this::class.simpleName}(id=$id)"
}