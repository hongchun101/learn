package io.github.dddlearning.port

import java.time.Instant

/**
 * Port for obtaining the current instant.
 *
 * Domain code never calls `Instant.now()` directly because that couples the domain to wall-clock
 * time, making it impossible to write deterministic tests or to virtualise time. Instead,
 * everything that needs "now" receives a [Clock] and asks for [now]. Production wires
 * [io.github.dddlearning.inmemory.SystemClock]; tests wire a fixed or mutable clock.
 */
fun interface Clock {
    /** Returns the current instant. */
    fun now(): Instant
}