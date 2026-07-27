package io.github.dddlearning.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Tests for [AggregateRoot] event-recording semantics.
 *
 * The two observable contracts:
 *  - [AggregateRoot.pullDomainEvents] returns events in raise order, then clears the buffer.
 *  - [AggregateRoot.peekDomainEvents] returns events without clearing.
 *
 * Identity equality is also defended because it is part of the aggregate root contract.
 */
class AggregateRootTest {

    private data class TestId(val raw: String)
    private data class Happened(override val eventId: EventId, override val occurredAt: Instant, val payload: String) : DomainEvent

    private class TestAggregate(id: TestId) : AggregateRoot<TestId>(id) {
        fun happen(payload: String, eventId: EventId, at: Instant) {
            raise(Happened(eventId, at, payload))
        }
    }

    @Test
    fun `pullDomainEvents returns events in raise order then clears the buffer`() {
        val agg = TestAggregate(TestId("a"))
        val first = EventId("first")
        val second = EventId("second")
        val third = EventId("third")

        agg.happen("one", first, Instant.parse("2024-01-01T00:00:00Z"))
        agg.happen("two", second, Instant.parse("2024-01-01T00:00:01Z"))
        agg.happen("three", third, Instant.parse("2024-01-01T00:00:02Z"))

        val pulled = agg.pullDomainEvents()

        assertEquals(listOf(first, second, third), pulled.map { it.eventId })
        assertEquals(listOf("one", "two", "three"), pulled.map { (it as Happened).payload })
        // Buffer cleared after pull.
        assertTrue(agg.pullDomainEvents().isEmpty())
        assertTrue(agg.peekDomainEvents().isEmpty())
    }

    @Test
    fun `peekDomainEvents does not clear the buffer`() {
        val agg = TestAggregate(TestId("a"))
        agg.happen("only", EventId("only"), Instant.parse("2024-01-01T00:00:00Z"))

        val seen = agg.peekDomainEvents()
        assertEquals(1, seen.size)

        // Subsequent pull returns the same event again.
        val pulled = agg.pullDomainEvents()
        assertEquals(seen, pulled)
    }

    @Test
    fun `pull on an aggregate with no events returns an empty list`() {
        val agg = TestAggregate(TestId("a"))
        assertTrue(agg.pullDomainEvents().isEmpty())
        assertTrue(agg.peekDomainEvents().isEmpty())
    }

    @Test
    fun `equality is identity-based within a concrete type`() {
        val a1 = TestAggregate(TestId("same"))
        val a2 = TestAggregate(TestId("same"))
        val a3 = TestAggregate(TestId("other"))

        assertEquals(a1, a2)
        assertNotEquals(a1, a3)
        assertEquals(a1.hashCode(), a2.hashCode())
    }

    @Test
    fun `equality does not cross aggregate types even with the same id`() {
        // A second concrete aggregate type with the same id-shape to prove equality is
        // class-sensitive, not just id-sensitive.
        class OtherAggregate(id: TestId) : AggregateRoot<TestId>(id)

        val left = TestAggregate(TestId("x"))
        val right = OtherAggregate(TestId("x"))

        assertNotEquals(left as AggregateRoot<*>, right as AggregateRoot<*>)
    }

    @Test
    fun `events retain their raised-at timestamp`() {
        val agg = TestAggregate(TestId("a"))
        val at = Instant.parse("2024-06-15T12:00:00Z")
        agg.happen("p", EventId("p"), at)

        val ev = agg.pullDomainEvents().single() as Happened
        assertEquals(at, ev.occurredAt)
        assertEquals(EventId("p"), ev.eventId)
    }
}