package io.github.dddlearning.messaging

import io.github.dddlearning.domain.EventId

/**
 * Port that records which inbound message ids have already been processed by a consumer.
 *
 * DDD role: at-least-once delivery from a broker implies that any consumer must be idempotent.
 * The cheapest way to be idempotent is to remember which message ids we have already applied
 * and skip the rest. Implementations MUST be transactional: the record MUST be written in the
 * same transaction as the side effects of processing the message, otherwise a crash between the
 * two writes will replay the message.
 */
interface ProcessedMessageStore {
    /**
     * Returns `true` if the message identified by [messageId] has been processed before.
     * Returns `false` otherwise.
     */
    fun isProcessed(messageId: EventId): Boolean

    /**
     * Records that the message identified by [messageId] has been processed. Idempotent:
     * recording an already-known id is a no-op.
     */
    fun markProcessed(messageId: EventId)
}