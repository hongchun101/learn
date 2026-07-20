package cp.chapters.ch02_juc;

import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * {@link Semaphore} — a counting licence plate. Useful for bounding
 * concurrent access to a finite pool (database connections, rate of
 * outbound calls, etc.).
 *
 * <p>Both {@code acquire()} and {@code release()} are full memory fences.
 * A successful {@code acquire()} happens-after the {@code release()} that
 * produced the permit, so all state established by the previous holder is
 * visible to the new acquirer (JLS §17.4.4 + AQS contract).
 */
public final class SemaphoreDemo {

    /** Tracks how many threads are concurrently inside the protected section. */
    public static final class MaxConcurrency {
        private final Semaphore gate;
        private final AtomicInteger concurrent = new AtomicInteger();
        private final AtomicInteger peak = new AtomicInteger();

        public MaxConcurrency(final int permits) {
            this.gate = new Semaphore(permits);
        }

        public void runInProtectedSection() throws InterruptedException {
            gate.acquire();
            try {
                final int now = concurrent.incrementAndGet();
                int observed;
                do {
                    observed = peak.get();
                    if (now <= observed) break;
                } while (!peak.compareAndSet(observed, now));
                // Yield to give other waiters a chance to enter — without
                // this, the critical section is so brief that scheduling
                // rarely lets more than one thread reach us at once.
                Thread.yield();
            } finally {
                concurrent.decrementAndGet();
                gate.release();
            }
        }

        public int peakConcurrency() {
            return peak.get();
        }
    }

    private SemaphoreDemo() {
    }
}
