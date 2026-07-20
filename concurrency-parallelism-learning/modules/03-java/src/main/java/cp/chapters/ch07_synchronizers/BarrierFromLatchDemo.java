package cp.chapters.ch07_synchronizers;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Build a barrier from a pair of {@link CountDownLatch}es — useful when
 * {@link java.util.concurrent.CyclicBarrier}'s built-in barrier action
 * is not powerful enough.
 *
 * <p>Each generation: {@code arrive} latch counts down by {@code parties},
 * the thread that brings it to zero runs the action and opens {@code gate}.
 * All other parties {@code await} on {@code gate}. Re-init runs under a
 * monitor so the reset is race-free.
 *
 * <p>Happens-before: {@code countDown()} on a latch synchronizes-with
 * subsequent {@code await()} returns on the same latch (AQS contract).
 */
public final class BarrierFromLatchDemo {

    /** A reusable barrier with a user-supplied per-generation action. */
    public static final class LatchBarrier {
        private final int parties;
        private final Object monitor = new Object();
        private CountDownLatch arrive;
        private CountDownLatch gate;
        private final AtomicInteger generations = new AtomicInteger();

        public LatchBarrier(final int parties) {
            this.parties = parties;
            this.arrive = new CountDownLatch(parties);
            this.gate = new CountDownLatch(1); // single-shot gate per generation
        }

        /** Run an arrival; the {@code action} executes once per generation. */
        public void arrive(final Runnable action) throws InterruptedException {
            final CountDownLatch myArrive;
            final CountDownLatch myGate;
            synchronized (monitor) {
                myArrive = arrive;
                myGate = gate;
            }
            myArrive.countDown();
            if (myArrive.getCount() == 0) {
                action.run();
                myGate.countDown();
                synchronized (monitor) {
                    if (arrive == myArrive) {
                        arrive = new CountDownLatch(parties);
                        gate = new CountDownLatch(1);
                        generations.incrementAndGet();
                    }
                }
            } else {
                if (!myGate.await(5, TimeUnit.SECONDS)) {
                    throw new InterruptedException("latch barrier gate timed out");
                }
            }
        }

        public int generations() {
            return generations.get();
        }
    }

    /**
     * Run {@code workers} workers through {@code waves} barrier rounds; the
     * per-wave action increments {@code shared} by the wave index.
     */
    public static int runWaves(final int workers, final int waves) throws InterruptedException {
        final LatchBarrier barrier = new LatchBarrier(workers);
        final AtomicInteger shared = new AtomicInteger();
        final List<Thread> ts = new ArrayList<Thread>();
        for (int w = 0; w < workers; w++) {
            final Thread t = new Thread(() -> {
                try {
                    for (int i = 0; i < waves; i++) {
                        final int wave = i;
                        barrier.arrive(new Runnable() {
                            @Override
                            public void run() {
                                shared.addAndGet(wave);
                            }
                        });
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "wave-" + w);
            ts.add(t);
        }
        for (Thread t : ts) t.start();
        for (Thread t : ts) t.join();
        return shared.get();
    }

    private BarrierFromLatchDemo() {
    }
}
