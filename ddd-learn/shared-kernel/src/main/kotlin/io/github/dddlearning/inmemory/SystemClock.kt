package io.github.dddlearning.inmemory

import io.github.dddlearning.port.Clock
import java.time.Instant

/**
 * Production [Clock] that delegates to the system clock.
 *
 * Test code SHOULD provide its own deterministic [Clock] implementation instead of relying on
 * this one, so tests do not depend on wall-clock progression.
 */
object SystemClock : Clock {
    override fun now(): Instant = Instant.now()
}