package cp.chapters.ch08_locks_advanced;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Demo runner for {@link CountDownLatchPlus} — exercise both the standard
 * {@code countDown}/{@code await} cycle and the {@code reset} extension.
 */
public final class CustomAqsLatchDemo {

    /**
     * Run {@code parties} workers through {@code phases} phases of an
     * AQS-based latch; return total phases observed.
     */
    public static int multiPhaseRun(final int parties, final int phases) throws InterruptedException {
        final CountDownLatchPlus latch = new CountDownLatchPlus(parties);
        final AtomicInteger observed = new AtomicInteger();
        final Thread[] ts = new Thread[parties];
        final CountDownLatch start = new CountDownLatch(1);
        for (int i = 0; i < parties; i++) {
            ts[i] = new Thread(() -> {
                try {
                    start.await();
                    latch.await();
                    observed.incrementAndGet();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "latch-" + Thread.currentThread().getId());
            ts[i].start();
        }
        start.countDown();
        // Each worker calls await() once per phase; reset for the next.
        for (int p = 0; p < phases; p++) {
            // each phase must complete fully before reset.
            Thread.sleep(50);
            // Count down one for each party in this phase.
            for (int j = 0; j < parties; j++) latch.countDown();
            // Let workers finish, then re-arm.
            Thread.sleep(50);
            latch.reset(parties);
        }
        // Final unblock: count down to zero and let everything drain.
        for (int j = 0; j < parties; j++) latch.countDown();
        for (Thread t : ts) t.join();
        return observed.get();
    }

    private CustomAqsLatchDemo() {
    }
}
