package io.github.dddlearning.process

import java.time.Instant

@JvmInline
value class ProcessId(val value: String) {
    init {
        require(value.isNotBlank()) { "ProcessId value must not be blank" }
    }

    override fun toString(): String = value
}

enum class ProcessStatus {
    RUNNING,
    COMPLETED,
    FAILED,
}

/** Immutable lifecycle metadata shared by saga/process-manager state objects. */
data class ProcessMetadata(
    val processId: ProcessId,
    val status: ProcessStatus,
    val version: Long,
    val updatedAt: Instant,
) {
    init {
        require(version >= 0) { "Process version must not be negative" }
    }
}

/**
 * Result of one deterministic process-manager transition.
 *
 * Commands are descriptions of work for application handlers; this type performs no I/O.
 */
data class ProcessDecision<S : Any, out C : Any>(
    val state: S,
    val commands: List<C>,
) {
    companion object {
        fun <S : Any, C : Any> transition(state: S, vararg commands: C): ProcessDecision<S, C> =
            ProcessDecision(state, commands.toList())

        fun <S : Any, C : Any> noCommands(state: S): ProcessDecision<S, C> =
            ProcessDecision(state, emptyList())
    }
}

/**
 * A lightweight, persistence-agnostic saga/process manager.
 *
 * Implementations must derive the next immutable state and commands solely from the supplied
 * state, event, and time. The caller persists [ProcessDecision.state] with optimistic locking and
 * dispatches its commands after persistence succeeds.
 */
fun interface ProcessManager<S : Any, in E : Any, C : Any> {
    fun handle(state: S?, event: E, occurredAt: Instant): ProcessDecision<S, C>
}
