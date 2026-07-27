package io.github.dddlearning.port

import io.github.dddlearning.domain.DomainEvent

/**
 * Port for delivering domain events to subscribers.
 *
 * Implementations of this port are responsible for getting in-memory [DomainEvent]s to
 * interested bounded contexts. The simplest in-process implementation lives at
 * [io.github.dddlearning.inmemory.InMemoryDomainEventPublisher]; production wiring typically
 * persists events via the transactional outbox and has a relay forward them to a broker.
 */
interface DomainEventPublisher {
    /** Publishes [event]. Must not throw on already-published events (idempotency). */
    fun publish(event: DomainEvent)

    /**
     * Publishes the given events; the default implementation calls [publish] for each.
     * Transactional implementations may batch.
     */
    fun publishAll(events: Iterable<DomainEvent>) {
        events.forEach(::publish)
    }
}