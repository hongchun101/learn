package cp.chapters.ch06_patterns;

import java.util.concurrent.locks.LockSupport;

/**
 * Cross-language pattern 3 — token-bucket rate limiter.
 *
 * <p>Mirrors {@code src/cross-lang/rate.ts}: produce at most
 * {@code ratePerSec} items per second on average, measured over
 * {@code durationMs}. Uses {@link LockSupport#parkNanos(long)} instead
 * of {@code Thread.sleep} so it cooperates better with virtual threads
 * and other concurrency primitives (and avoids wake-up granularity
 * surprises on Windows / Linux).
 *
 * <p>This implementation tracks an absolute <i>next-allowed</i> timestamp
 * that starts at the first observation time and advances by exactly
 * {@code intervalNanos} on each production. That keeps the long-run
 * average tight at {@code ratePerSec} even when individual
 * {@code parkNanos} calls overrun their target (a common issue with
 * very small intervals).
 */
public final class RateLimiter {

    private RateLimiter() {
    }

    /**
     * Produce at most {@code ratePerSec} items per second for
     * {@code durationMs}, then return the count produced.
     */
    public static int run(final int ratePerSec, final long durationMs) {
        if (ratePerSec < 1) {
            throw new IllegalArgumentException("ratePerSec must be >= 1");
        }
        if (durationMs < 1) return 0;
        final long intervalNanos = 1_000_000_000L / ratePerSec;
        final long deadlineNanos = System.nanoTime() + durationMs * 1_000_000L;
        int produced = 0;
        long nextAllowed = System.nanoTime();
        while (System.nanoTime() < deadlineNanos) {
            final long now = System.nanoTime();
            final long waitNanos = nextAllowed - now;
            if (waitNanos <= 0) {
                produced++;
                nextAllowed += intervalNanos;
            } else {
                LockSupport.parkNanos(waitNanos);
                if (Thread.interrupted()) {
                    Thread.currentThread().interrupt();
                    return produced;
                }
            }
        }
        return produced;
    }
}
