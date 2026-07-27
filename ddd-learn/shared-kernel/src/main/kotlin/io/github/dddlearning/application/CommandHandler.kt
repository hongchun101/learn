package io.github.dddlearning.application

/**
 * Application-layer command handler.
 *
 * DDD role: the application layer is the orchestration boundary between the outside world
 * (HTTP, CLI, messages) and the domain. Each user intent becomes a command object that is
 * dispatched to a single [CommandHandler]; the handler loads aggregates via their repositories,
 * invokes their behaviour methods, persists the resulting state, and (typically via the outbox)
 * publishes the produced domain events.
 *
 * Commands are intentionally simple data carriers. The handler is the single place where the
 * side effects of fulfilling an intent are sequenced.
 *
 * @param C the command type this handler accepts.
 * @param R the result the handler returns to the caller.
 */
fun interface CommandHandler<C : Any, R : Any> {
    fun handle(command: C): R
}