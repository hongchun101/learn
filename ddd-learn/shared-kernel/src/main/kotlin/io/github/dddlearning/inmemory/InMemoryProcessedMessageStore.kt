package io.github.dddlearning.inmemory

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.messaging.ProcessedMessageStore

/**
 * In-memory [ProcessedMessageStore] backed by a [MutableSet].
 *
 * Useful for tests and process-local wiring. Not safe for concurrent use; wrap in external
 * synchronisation if needed.
 */
class InMemoryProcessedMessageStore : ProcessedMessageStore {
    private val processed: MutableSet<EventId> = mutableSetOf()

    override fun isProcessed(messageId: EventId): Boolean = messageId in processed

    override fun markProcessed(messageId: EventId) {
        processed.add(messageId)
    }

    /** Returns the number of distinct messages recorded so far. */
    fun size(): Int = processed.size

    /** Removes every record. Intended for test setup. */
    fun reset() {
        processed.clear()
    }
}