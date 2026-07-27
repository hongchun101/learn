package io.github.dddlearning.integration

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.port.DomainEventPublisher
import kotlin.reflect.KClass

/** Handles one concrete domain event type. */
fun interface TypedDomainEventHandler<in E : DomainEvent> {
    fun handle(event: E)
}

/** A registration that removes its handler when closed. Closing it repeatedly is safe. */
fun interface EventSubscription : AutoCloseable {
    override fun close()
}

/**
 * Synchronous, in-process, typed event bus.
 *
 * Handlers are invoked in registration order for the event's exact runtime type. Publication is
 * fail-fast: a handler exception is propagated and later handlers are not invoked. This bus adds
 * no durability or retry by itself; use an outbox relay at an integration boundary when delivery
 * must survive process failure.
 */
class InProcessTypedEventBus : DomainEventPublisher {
    private val monitor = Any()
    private val handlers = mutableMapOf<KClass<out DomainEvent>, MutableList<RegisteredHandler>>()

    fun <E : DomainEvent> subscribe(
        eventType: KClass<E>,
        handler: TypedDomainEventHandler<E>,
    ): EventSubscription {
        val registered = RegisteredHandler { event ->
            @Suppress("UNCHECKED_CAST")
            handler.handle(event as E)
        }
        synchronized(monitor) {
            handlers.getOrPut(eventType) { mutableListOf() }.add(registered)
        }

        return EventSubscription {
            synchronized(monitor) {
                handlers[eventType]?.let { registrations ->
                    registrations.remove(registered)
                    if (registrations.isEmpty()) handlers.remove(eventType)
                }
            }
        }
    }

    inline fun <reified E : DomainEvent> subscribe(
        handler: TypedDomainEventHandler<E>,
    ): EventSubscription = subscribe(E::class, handler)

    override fun publish(event: DomainEvent) {
        val currentHandlers = synchronized(monitor) {
            handlers[event::class]?.toList().orEmpty()
        }
        currentHandlers.forEach { it.handle(event) }
    }

    private fun interface RegisteredHandler {
        fun handle(event: DomainEvent)
    }
}
