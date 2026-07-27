package io.github.dddlearning.messaging

import io.github.dddlearning.domain.DomainEvent
import io.github.dddlearning.domain.EventId
import io.github.dddlearning.inmemory.InMemoryOutbox
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Tests for the transactional outbox state machine.
 *
 * The outbox transitions messages from [OutboxStatus.PENDING] to [OutboxStatus.PUBLISHED] and
 * must surface pending messages in insertion order. Marking must be idempotent and tolerant of
 * unknown ids.
 */
class OutboxTest {

    private data class SampleEvent(
        override val eventId: EventId,
        override val occurredAt: Instant,
        val note: String,
    ) : DomainEvent

    private fun envelope(id: String, at: Instant = Instant.parse("2024-01-01T00:00:00Z"), note: String = ""): EventEnvelope {
        val ev = SampleEvent(EventId(id), at, note)
        return EventEnvelope(ev.eventId, ev::class.qualifiedName!!, ev.occurredAt, ev)
    }

    @Test
    fun `enqueue then pending returns messages in insertion order with PENDING status`() {
        val outbox = InMemoryOutbox()
        val e1 = envelope("a", Instant.parse("2024-01-01T00:00:00Z"))
        val e2 = envelope("b", Instant.parse("2024-01-01T00:00:01Z"))
        val e3 = envelope("c", Instant.parse("2024-01-01T00:00:02Z"))

        outbox.enqueue(e1)
        outbox.enqueue(e2)
        outbox.enqueue(e3)

        val pending = outbox.pending()
        assertEquals(listOf(EventId("a"), EventId("b"), EventId("c")), pending.map { it.messageId })
        assertTrue(pending.all { it.status == OutboxStatus.PENDING })
        assertEquals(listOf(e1, e2, e3).map { it.payload }, pending.map { it.payload })
    }

    @Test
    fun `markPublished transitions a single message and removes it from pending`() {
        val outbox = InMemoryOutbox()
        outbox.enqueue(envelope("a"))
        outbox.enqueue(envelope("b"))

        outbox.markPublished(EventId("a"))

        val pending = outbox.pending()
        assertEquals(listOf(EventId("b")), pending.map { it.messageId })
        assertEquals(OutboxStatus.PUBLISHED, outbox.find(EventId("a"))?.status)
        assertEquals(OutboxStatus.PENDING, outbox.find(EventId("b"))?.status)
    }

    @Test
    fun `markPublished is idempotent`() {
        val outbox = InMemoryOutbox()
        outbox.enqueue(envelope("a"))

        outbox.markPublished(EventId("a"))
        outbox.markPublished(EventId("a"))
        outbox.markPublished(EventId("a"))

        assertEquals(OutboxStatus.PUBLISHED, outbox.find(EventId("a"))?.status)
        assertTrue(outbox.pending().isEmpty())
    }

    @Test
    fun `markPublished tolerates unknown ids`() {
        val outbox = InMemoryOutbox()
        outbox.enqueue(envelope("a"))

        // Should not throw.
        outbox.markPublished(EventId("ghost"))

        assertEquals(OutboxStatus.PENDING, outbox.find(EventId("a"))?.status)
    }

    @Test
    fun `find returns null for unknown id and the message for a known id`() {
        val outbox = InMemoryOutbox()
        outbox.enqueue(envelope("a"))

        assertNull(outbox.find(EventId("nope")))
        assertFalse(outbox.find(EventId("a")) == null)
    }

    @Test
    fun `all snapshot contains both PENDING and PUBLISHED rows`() {
        val outbox = InMemoryOutbox()
        outbox.enqueue(envelope("a"))
        outbox.enqueue(envelope("b"))
        outbox.markPublished(EventId("a"))

        val all = outbox.all()
        assertEquals(2, all.size)
        assertEquals(setOf(EventId("a"), EventId("b")), all.map { it.messageId }.toSet())
    }

    @Test
    fun `EventEnvelope of derives messageId from the event's own EventId`() {
        val ev = SampleEvent(EventId("self"), Instant.parse("2024-01-01T00:00:00Z"), "x")
        val env = EventEnvelope.of(ev)
        assertEquals(EventId("self"), env.messageId)
        assertEquals(ev, env.payload)
    }
}