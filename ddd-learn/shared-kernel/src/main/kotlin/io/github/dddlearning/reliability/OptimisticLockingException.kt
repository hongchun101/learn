package io.github.dddlearning.reliability

/**
 * Signals that a write used a stale aggregate version.
 *
 * Repositories should throw this exception when [actualVersion] no longer equals
 * [expectedVersion], allowing the application boundary to retry or report a conflict.
 */
class OptimisticLockingException(
    val aggregateType: String,
    val aggregateId: Any,
    val expectedVersion: Long,
    val actualVersion: Long,
) : RuntimeException(
    "Optimistic lock failed for $aggregateType '$aggregateId': " +
        "expected version $expectedVersion but found $actualVersion",
) {
    init {
        require(aggregateType.isNotBlank()) { "Aggregate type must not be blank" }
        require(expectedVersion >= 0) { "Expected version must not be negative" }
        require(actualVersion >= 0) { "Actual version must not be negative" }
    }
}
