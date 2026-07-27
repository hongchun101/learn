package io.github.dddlearning.messaging

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.inmemory.InMemoryProcessedMessageStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Tests for the [ProcessedMessageStore] idempotency contract.
 *
 * The consumer-side invariant is: once a message id has been recorded, every subsequent query
 * for it must report `true` regardless of how many times it was inserted. Recording an
 * already-known id MUST NOT corrupt the store.
 */
class IdempotencyTest {

    @Test
    fun `isProcessed returns false for unknown ids and true after markProcessed`() {
        val store = InMemoryProcessedMessageStore()
        val id = EventId("first")

        assertFalse(store.isProcessed(id))
        store.markProcessed(id)
        assertTrue(store.isProcessed(id))
    }

    @Test
    fun `markProcessed is idempotent and does not double-count`() {
        val store = InMemoryProcessedMessageStore()
        val id = EventId("dup")

        store.markProcessed(id)
        store.markProcessed(id)
        store.markProcessed(id)

        assertTrue(store.isProcessed(id))
        assertEquals(1, store.size())
    }

    @Test
    fun `reset clears every record`() {
        val store = InMemoryProcessedMessageStore()
        store.markProcessed(EventId("a"))
        store.markProcessed(EventId("b"))

        store.reset()

        assertEquals(0, store.size())
        assertFalse(store.isProcessed(EventId("a")))
        assertFalse(store.isProcessed(EventId("b")))
    }

    @Test
    fun `distinct ids are tracked independently`() {
        val store = InMemoryProcessedMessageStore()
        val a = EventId("a")
        val b = EventId("b")
        val c = EventId("c")

        store.markProcessed(a)
        store.markProcessed(b)

        assertTrue(store.isProcessed(a))
        assertTrue(store.isProcessed(b))
        assertFalse(store.isProcessed(c))
        assertEquals(2, store.size())
    }
}