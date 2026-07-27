package io.github.dddlearning.inmemory

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.port.DomainEventPublisher

/**
 * In-memory [DomainEventPublisher] that collects published events into a list.
 *
 * Useful in tests and in-process wiring where no external broker is available. The list is the
 * shared mutable state of this singleton; callers MUST treat the returned reference as read-only.
 */
object InMemoryDomainEventPublisher : DomainEventPublisher {
    private val published: MutableList<DomainEvent> = mutableListOf()

    override fun publish(event: DomainEvent) {
        published.add(event)
    }

    /** Returns an immutable snapshot of the events published so far. */
    fun snapshot(): List<DomainEvent> = published.toList()

    /** Removes all recorded events. Intended for test setup. */
    fun reset() {
        published.clear()
    }
}