package io.github.dddlearning.reliability

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.messaging.Outbox
import io.github.dddlearning.port.Clock
import io.github.dddlearning.port.DomainEventPublisher
import java.time.Instant

enum class DeliveryAttemptOutcome {
    SUCCEEDED,
    FAILED,
}

/** Immutable audit record for one broker publication attempt. */
data class DeliveryAttempt(
    val messageId: EventId,
    val attemptNumber: Int,
    val attemptedAt: Instant,
    val outcome: DeliveryAttemptOutcome,
    val failureDescription: String? = null,
) {
    init {
        require(attemptNumber > 0) { "Attempt number must be positive" }
        require(
            (outcome == DeliveryAttemptOutcome.SUCCEEDED && failureDescription == null) ||
                (outcome == DeliveryAttemptOutcome.FAILED && !failureDescription.isNullOrBlank()),
        ) { "Only failed attempts must have a non-blank failure description" }
    }
}

/**
 * Durable port for publication-attempt history.
 *
 * Implementations should append records and calculate attempt numbers atomically per message when
 * more than one relay can run concurrently.
 */
interface DeliveryAttemptStore {
    fun append(attempt: DeliveryAttempt)
    fun attemptsFor(messageId: EventId): List<DeliveryAttempt>
}

/** Process-local attempt store for teaching, tests, and single-threaded wiring. */
class InMemoryDeliveryAttemptStore : DeliveryAttemptStore {
    private val attempts = mutableListOf<DeliveryAttempt>()

    override fun append(attempt: DeliveryAttempt) {
        val expectedNumber = attempts.count { it.messageId == attempt.messageId } + 1
        require(attempt.attemptNumber == expectedNumber) {
            "Expected attempt $expectedNumber for ${attempt.messageId} but got ${attempt.attemptNumber}"
        }
        attempts.add(attempt)
    }

    override fun attemptsFor(messageId: EventId): List<DeliveryAttempt> =
        attempts.filter { it.messageId == messageId }.toList()
}

data class RelayBatchResult(
    val publishedMessageIds: List<EventId>,
    val failedMessageIds: List<EventId>,
) {
    val attemptedCount: Int get() = publishedMessageIds.size + failedMessageIds.size
}

/**
 * Retryable outbox relay providing at-least-once publication.
 *
 * Each invocation attempts the current pending snapshot once. A failed publication is recorded and
 * deliberately remains pending for the next invocation. On success, the attempt is recorded before
 * the outbox row is marked published. Therefore a crash between broker acknowledgement and marking
 * may publish a duplicate, but cannot silently lose the pending message; consumers must be
 * idempotent. Attempt records are an audit trail, not a retry scheduler.
 */
class AtLeastOnceOutboxRelay(
    private val outbox: Outbox,
    private val publisher: DomainEventPublisher,
    private val clock: Clock,
    private val attemptStore: DeliveryAttemptStore,
) {
    fun relayPending(): RelayBatchResult {
        val published = mutableListOf<EventId>()
        val failed = mutableListOf<EventId>()

        outbox.pending().forEach { message ->
            val attemptNumber = attemptStore.attemptsFor(message.messageId).size + 1
            val attemptedAt = clock.now()
            try {
                publisher.publish(message.payload)
            } catch (exception: Exception) {
                attemptStore.append(
                    DeliveryAttempt(
                        messageId = message.messageId,
                        attemptNumber = attemptNumber,
                        attemptedAt = attemptedAt,
                        outcome = DeliveryAttemptOutcome.FAILED,
                        failureDescription = exception.message
                            ?.takeIf(String::isNotBlank)
                            ?: exception::class.simpleName
                            ?: "Publication failed",
                    ),
                )
                failed.add(message.messageId)
                return@forEach
            }

            attemptStore.append(
                DeliveryAttempt(
                    messageId = message.messageId,
                    attemptNumber = attemptNumber,
                    attemptedAt = attemptedAt,
                    outcome = DeliveryAttemptOutcome.SUCCEEDED,
                ),
            )
            outbox.markPublished(message.messageId)
            published.add(message.messageId)
        }

        return RelayBatchResult(
            publishedMessageIds = published.toList(),
            failedMessageIds = failed.toList(),
        )
    }
}
