package io.github.dddlearning.inmemory

import io.github.dddlearning.domain.EventId
import io.github.dddlearning.port.IdGenerator
import java.util.UUID

/**
 * Production [IdGenerator] that mints [EventId]s from random UUIDs.
 *
 * Other identifier flavours (`OrderId`, `CustomerId`, ...) are minted with the same UUID
 * strategy wrapped in their own strongly typed value class; this generator targets [EventId]
 * because events are the only identity every bounded context shares.
 */
object UuidIdGenerator : IdGenerator<EventId> {
    override fun nextId(): EventId = EventId(UUID.randomUUID().toString())
}