package cp.chapters.ch08_locks_advanced;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.AbstractQueuedSynchronizer;

/**
 * A from-scratch {@code CountDownLatchPlus}: {@link java.util.concurrent.CountDownLatch}
 * behaviour plus a {@code reset()} that the standard class does not have.
 * Built directly on {@link AbstractQueuedSynchronizer} (AQS).
 *
 * <p>AQS exposes a single 32-bit {@code state} plus FIFO wait queue.
 * Acquire methods inspect {@link AbstractQueuedSynchronizer#tryAcquireShared(int)};
 * release methods inspect
 * {@link AbstractQueuedSynchronizer#tryReleaseShared(int)}. {@code state}
 * here stores the "remaining count"; arrival reaches zero, acquire
 * returns success, and {@code reset()} restores it.
 *
 * <p>Happens-before: the {@code tryReleaseShared} that flips state to
 * zero synchronizes-with the {@code tryAcquireShared} that observes it
 * via the AQS internal {@code compareAndSet} fence on the {@code state}
 * field (JLS §17.7).
 */
public final class CountDownLatchPlus {

    /**
     * The AQS machinery. We use shared-mode so multiple threads can wait
     * simultaneously and a single {@code tryReleaseShared} wakes all of
     * them when the count reaches zero.
     */
    private static final class Sync extends AbstractQueuedSynchronizer {
        private static final long serialVersionUID = 1L;

        Sync(final int initial) {
            setState(initial);
        }

        @Override
        protected int tryAcquireShared(final int arg) {
            // Returns 1 if open, -1 if still closed.
            return getState() == 0 ? 1 : -1;
        }

        @Override
        protected boolean tryReleaseShared(final int arg) {
            for (;;) {
                final int s = getState();
                if (s == 0) return false;
                final int next = s - 1;
                if (compareAndSetState(s, next)) {
                    return next == 0;
                }
            }
        }

        int peekCount() {
            return getState();
        }

        void rearm(final int newCount) {
            setState(newCount);
        }
    }

    private final Sync sync;

    public CountDownLatchPlus(final int count) {
        if (count < 0) throw new IllegalArgumentException("count must be >= 0");
        this.sync = new Sync(count);
    }

    public void countDown() {
        sync.releaseShared(1);
    }

    public void await() throws InterruptedException {
        sync.acquireSharedInterruptibly(1);
    }

    public boolean await(final long timeoutMs) throws InterruptedException {
        return sync.tryAcquireSharedNanos(1, TimeUnit.MILLISECONDS.toNanos(timeoutMs));
    }

    public int getCount() {
        return sync.peekCount();
    }

    /**
     * Restore the count to {@code newCount}. If {@code newCount} is greater
     * than the current state, callers are relying on the implicit invariant
     * that no thread is mid-{@code await()}; we document this in the README.
     */
    public void reset(final int newCount) {
        if (newCount < 0) throw new IllegalArgumentException();
        sync.rearm(newCount);
    }
}
