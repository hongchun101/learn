package cp.chapters.ch01_threads;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Chapter 1 — Raw threads and the {@code synchronized} keyword.
 *
 * <p>This demonstration walks the simplest building blocks the JVM gives us:
 * {@link Thread}, {@link Runnable}, the {@code synchronized} intrinsic lock,
 * the {@code wait}/{@code notify} pair, and {@link ThreadLocal}.
 *
 * <h3>Happens-before in this file</h3>
 * <ul>
 *   <li>{@code start()} → thread-start edge: every action the new thread takes
 *       happens-after the {@code start()} call in the parent (JLS §17.4.4).</li>
 *   <li>Monitor lock acquire → release edge: every action inside a
 *       {@code synchronized} block happens-before any thread that subsequently
 *       acquires the same monitor (JLS §17.4.4).</li>
 *   <li>{@code Thread.join()} → thread-termination edge: actions of the joined
 *       thread happen-before the caller resumes from {@code join()}.</li>
 * </ul>
 */
public final class ThreadBasics {

    /** Tiny shared counter used to demonstrate a race and its fix. */
    static final class UnsafeCounter {
        private int value;

        int increment() {
            // Not thread-safe; two threads can read the same value, lose updates.
            return ++value;
        }

        int get() {
            return value;
        }
    }

    /** Same counter but guarded by the intrinsic monitor of {@code this}. */
    static final class SafeCounter {
        private int value;

        synchronized int increment() {
            return ++value;
        }

        synchronized int get() {
            return value;
        }
    }

    private ThreadBasics() {
    }

    /**
     * Two threads race on the unsafe counter. The final value can be less than
     * {@code iterations} because lost updates are not detected.
     */
    public static int raceAndLose(final int iterations, final int threadCount) throws InterruptedException {
        final UnsafeCounter counter = new UnsafeCounter();
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threadCount);
        final AtomicBoolean ready = new AtomicBoolean(false);
        for (int t = 0; t < threadCount; t++) {
            final Thread worker = new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        ready.set(true);
                        start.await();
                        for (int i = 0; i < iterations; i++) {
                            counter.increment();
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                }
            }, "racer-" + t);
            worker.start();
        }
        // spin until at least one worker has entered the run loop, just to make
        // the race tighter for demonstration purposes.
        while (!ready.get()) {
            Thread.yield();
        }
        start.countDown();
        done.await();
        return counter.get();
    }

    /**
     * Two threads race on the synchronized counter. The final value will
     * always equal {@code iterations * threadCount}.
     */
    public static int raceAndWin(final int iterations, final int threadCount) throws InterruptedException {
        final SafeCounter counter = new SafeCounter();
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threadCount);
        for (int t = 0; t < threadCount; t++) {
            final Thread worker = new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        start.await();
                        for (int i = 0; i < iterations; i++) {
                            counter.increment();
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                }
            }, "saferacer-" + t);
            worker.start();
        }
        start.countDown();
        done.await();
        return counter.get();
    }
}
