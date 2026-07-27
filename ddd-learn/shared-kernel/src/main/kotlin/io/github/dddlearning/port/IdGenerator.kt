package io.github.dddlearning.port

/**
 * Port for generating identifiers.
 *
 * DDD role: aggregate creation requires minting a fresh identifier. To keep domain code free of
 * I/O concerns and to allow deterministic tests, identity generation is hidden behind this
 * port. Production wires [io.github.dddlearning.inmemory.UuidIdGenerator]; tests wire a
 * sequence-based generator.
 *
 * @param T the type of identifier produced (e.g. `OrderId`, `EventId`).
 */
fun interface IdGenerator<T> {
    /** Returns a freshly minted identifier. MUST return a unique value on every call. */
    fun nextId(): T
}