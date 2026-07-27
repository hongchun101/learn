package io.github.dddlearning.reliability

import io.github.dddlearning.messaging.EventEnvelope
import io.github.dddlearning.messaging.ProcessedMessageStore

/** Handles an event together with its delivery identity and transport metadata. */
fun interface EventEnvelopeHandler {
    fun handle(envelope: EventEnvelope)
}

/**
 * Suppresses duplicate, sequential at-least-once deliveries by [EventEnvelope.messageId].
 *
 * A message is marked processed only after the delegate returns successfully, so a failed handler
 * remains retryable. For crash safety and concurrent consumers, the delegate's side effects and
 * [ProcessedMessageStore.markProcessed] must share one transaction and the store must enforce a
 * unique message id. The decorator deliberately does not hide handler failures.
 */
class IdempotentEventHandler(
    private val processedMessages: ProcessedMessageStore,
    private val delegate: EventEnvelopeHandler,
) : EventEnvelopeHandler {
    override fun handle(envelope: EventEnvelope) {
        if (processedMessages.isProcessed(envelope.messageId)) return

        delegate.handle(envelope)
        processedMessages.markProcessed(envelope.messageId)
    }
}
