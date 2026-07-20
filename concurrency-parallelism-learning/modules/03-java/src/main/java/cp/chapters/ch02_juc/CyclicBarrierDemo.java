package cp.chapters.ch02_juc;

import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * {@link CyclicBarrier} — N-party rendezvous that resets. Each generation,
 * all {@code parties} threads must call {@code await()} before any of them
 * is released. It differs from {@link CountDownLatch} in two ways: it is
 * reusable, and it supports a per-generation barrier action.
 *
 * <p>Happens-before: the trip edge inside {@code await()} synchronizes-with
 * the release of all parties; the barrier action runs in one of the
 * arriving threads before that thread returns from {@code await()}, so
 * other parties see its writes via the monitor of the barrier's internal
 * lock.
 */
public final class CyclicBarrierDemo {

    /** Two-phase barrier used by N threads; tracks generations of rendezvous. */
    public static final class TwoPhase {
        private final int parties;
        private final CyclicBarrier barrier;
        private final AtomicInteger generations = new AtomicInteger();

        public TwoPhase(final int parties) {
            this.parties = parties;
            this.barrier = new CyclicBarrier(parties, new Runnable() {
                @Override
                public void run() {
                    generations.incrementAndGet();
                }
            });
        }

        public void arrive() throws Exception {
            barrier.await();
        }

        public int generations() {
            return generations.get();
        }

        public int parties() {
            return parties;
        }
    }

    private CyclicBarrierDemo() {
    }
}
