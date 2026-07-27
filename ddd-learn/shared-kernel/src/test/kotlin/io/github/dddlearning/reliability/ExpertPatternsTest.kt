package io.github.dddlearning.reliability

import io.github.dddlearning.architecture.ArchitectureFitness
import io.github.dddlearning.architecture.Dependency
import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.inmemory.InMemoryOutbox
import io.github.dddlearning.inmemory.InMemoryProcessedMessageStore
import io.github.dddlearning.integration.InProcessTypedEventBus
import io.github.dddlearning.messaging.EventEnvelope
import io.github.dddlearning.messaging.OutboxStatus
import io.github.dddlearning.port.Clock
import io.github.dddlearning.port.DomainEventPublisher
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ExpertPatternsTest {
    private data class SampleEvent(
        override val eventId: EventId,
        override val occurredAt: Instant,
        val description: String,
    ) : DomainEvent

    private val firstAttemptAt = Instant.parse("2025-01-01T00:00:00Z")
    private val secondAttemptAt = Instant.parse("2025-01-01T00:01:00Z")

    @Test
    fun `idempotent decorator suppresses duplicate after successful handling`() {
        val processedMessages = InMemoryProcessedMessageStore()
        val handled = mutableListOf<String>()
        val handler = IdempotentEventHandler(processedMessages) { envelope ->
            handled.add((envelope.payload as SampleEvent).description)
        }
        val envelope = envelope("same-message", "reserve stock")

        handler.handle(envelope)
        handler.handle(envelope)

        assertEquals(listOf("reserve stock"), handled)
        assertTrue(processedMessages.isProcessed(envelope.messageId))
    }

    @Test
    fun `idempotent decorator retries a handler that failed before completion`() {
        val processedMessages = InMemoryProcessedMessageStore()
        var invocations = 0
        val handler = IdempotentEventHandler(processedMessages) { envelope ->
            invocations += 1
            if (invocations == 1) error("temporary failure")
            assertEquals("retry-me", (envelope.payload as SampleEvent).description)
        }
        val envelope = envelope("retryable-handler", "retry-me")

        kotlin.runCatching { handler.handle(envelope) }
        assertFalse(processedMessages.isProcessed(envelope.messageId))
        handler.handle(envelope)

        assertEquals(2, invocations)
        assertTrue(processedMessages.isProcessed(envelope.messageId))
    }

    @Test
    fun `failed outbox message remains pending and is retried then published`() {
        val outbox = InMemoryOutbox()
        val envelope = envelope("relay-message", "order placed")
        outbox.enqueue(envelope)
        val attempts = InMemoryDeliveryAttemptStore()
        val clock = SequenceClock(firstAttemptAt, secondAttemptAt)
        var publisherInvocations = 0
        val flakyPublisher = object : DomainEventPublisher {
            override fun publish(event: DomainEvent) {
                publisherInvocations += 1
                if (publisherInvocations == 1) error("broker unavailable")
            }
        }
        val relay = AtLeastOnceOutboxRelay(outbox, flakyPublisher, clock, attempts)

        val failedBatch = relay.relayPending()

        assertEquals(listOf(envelope.messageId), failedBatch.failedMessageIds)
        assertTrue(failedBatch.publishedMessageIds.isEmpty())
        assertEquals(OutboxStatus.PENDING, outbox.find(envelope.messageId)?.status)
        assertEquals(
            DeliveryAttempt(
                messageId = envelope.messageId,
                attemptNumber = 1,
                attemptedAt = firstAttemptAt,
                outcome = DeliveryAttemptOutcome.FAILED,
                failureDescription = "broker unavailable",
            ),
            attempts.attemptsFor(envelope.messageId).single(),
        )

        val successfulBatch = relay.relayPending()

        assertEquals(listOf(envelope.messageId), successfulBatch.publishedMessageIds)
        assertTrue(successfulBatch.failedMessageIds.isEmpty())
        assertEquals(OutboxStatus.PUBLISHED, outbox.find(envelope.messageId)?.status)
        assertEquals(2, publisherInvocations)
        assertEquals(
            listOf(DeliveryAttemptOutcome.FAILED, DeliveryAttemptOutcome.SUCCEEDED),
            attempts.attemptsFor(envelope.messageId).map(DeliveryAttempt::outcome),
        )
        assertEquals(
            listOf(1, 2),
            attempts.attemptsFor(envelope.messageId).map(DeliveryAttempt::attemptNumber),
        )
        assertEquals(
            listOf(firstAttemptAt, secondAttemptAt),
            attempts.attemptsFor(envelope.messageId).map(DeliveryAttempt::attemptedAt),
        )
    }

    @Test
    fun `typed bus routes exact event type and closed subscription receives no more events`() {
        val bus = InProcessTypedEventBus()
        val descriptions = mutableListOf<String>()
        val subscription = bus.subscribe<SampleEvent> { descriptions.add(it.description) }

        bus.publish(sampleEvent("event-one", "first"))
        subscription.close()
        subscription.close()
        bus.publish(sampleEvent("event-two", "second"))

        assertEquals(listOf("first"), descriptions)
    }

    @Test
    fun `architecture fitness checks package boundaries without loading classes`() {
        val rules = ArchitectureFitness.boundedContextIsolation(
            rootPackage = "io.github.dddlearning",
            contextPackages = setOf("ordering", "inventory"),
        )
        val dependencies = listOf(
            Dependency(
                source = "io.github.dddlearning.ordering.domain.Order",
                target = "io.github.dddlearning.inventory.domain.Stock",
            ),
            Dependency(
                source = "io.github.dddlearning.ordering.application.PlaceOrder",
                target = "io.github.dddlearning.inventory.application.ReserveStock",
            ),
        )

        val violations = ArchitectureFitness.inspect(dependencies, rules)

        assertEquals(1, violations.size)
        assertEquals(dependencies.first(), violations.single().dependency)
    }

    private fun envelope(id: String, description: String): EventEnvelope =
        EventEnvelope.of(sampleEvent(id, description))

    private fun sampleEvent(id: String, description: String): SampleEvent =
        SampleEvent(EventId(id), firstAttemptAt, description)

    private class SequenceClock(vararg instants: Instant) : Clock {
        private val remaining = ArrayDeque(instants.toList())

        override fun now(): Instant = remaining.removeFirst()
    }
}
