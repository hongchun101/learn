package cp.chapters.ch02_juc;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Chapter 2 — {@link ReentrantLock}.
 *
 * <p>An explicit lock with three features intrinsic locking lacks out of
 * the box:
 * <ul>
 *   <li>timed acquire via {@link java.util.concurrent.locks.Lock#tryLock(long, TimeUnit)},</li>
 *   <li>interruptible acquire,</li>
 *   <li>non-block-structured ownership (locks can be held across methods).</li>
 * </ul>
 *
 * <p>Happens-before: a successful {@code lock()} creates a synchronizes-with
 * edge with the matching {@code unlock()} on the same thread, so any writes
 * protected by that pair are visible to subsequent acquirers. The JVM
 * implements this via a full memory fence inside the AQS implementation.
 */
public final class ReentrantLockDemo {

    /** A guarded counter using a {@link ReentrantLock}. */
    public static final class Counter {
        private final ReentrantLock lock = new ReentrantLock();
        private long value;

        public long incrementAndGet() {
            lock.lock();
            try {
                return ++value;
            } finally {
                lock.unlock();
            }
        }

        public long get() {
            lock.lock();
            try {
                return value;
            } finally {
                lock.unlock();
            }
        }
    }

    /**
     * Two threads attempt {@code tryLock}: the "holder" grabs the lock and
     * sleeps, the "waiter" tries to grab it with a timeout. Returns the
     * wall-clock milliseconds the waiter had to wait before it acquired.
     */
    public static long timedAcquireDemo(final ReentrantLock lock,
                                        final long holdMs,
                                        final long timeoutMs) throws InterruptedException {
        final CountDownLatch holderReady = new CountDownLatch(1);
        final CountDownLatch holderDone = new CountDownLatch(1);
        final Thread holder = new Thread(new Runnable() {
            @Override
            public void run() {
                lock.lock();
                try {
                    holderReady.countDown();
                    try {
                        Thread.sleep(holdMs);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                } finally {
                    lock.unlock();
                    holderDone.countDown();
                }
            }
        }, "holder");
        holder.start();
        holderReady.await();
        final long t0 = System.nanoTime();
        final boolean acquired = lock.tryLock(timeoutMs, TimeUnit.MILLISECONDS);
        final long elapsedMs = (System.nanoTime() - t0) / 1_000_000L;
        if (acquired) {
            try {
                holderDone.await();
            } finally {
                lock.unlock();
            }
        }
        return elapsedMs;
    }

    private ReentrantLockDemo() {
    }
}
