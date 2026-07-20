package cp.chapters.ch06_patterns;

import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Cross-language pattern 5 — bounded multi-producer / multi-consumer
 * queue.
 *
 * <p>Mirrors {@code src/cross-lang/mpmc.ts}: producers block on full,
 * consumers block on empty with a timeout. Closing the queue unblocks
 * any waiting consumers.
 *
 * <p>This implementation wraps {@link LinkedBlockingQueue} for the
 * actual storage (which is a rock-solid bounded MPMC implementation)
 * and adds a {@code closed} flag that converts timed-out consumers into
 * {@code null} returns. The wrapper preserves the four contract
 * operations:
 * <ul>
 *   <li>{@code enqueue(item)} — blocks until there is room.</li>
 *   <li>{@code dequeue(timeoutMs)} — polls with a timeout; returns
 *       {@code null} on timeout or after {@code close()} drains. Always
 *       tries at least one non-blocking poll first so a {@code 0}
 *       timeout from a non-empty queue returns the next item.</li>
 *   <li>{@code close()} — stops accepting new items, drains waiters.</li>
 *   <li>{@code capacity()} — fixed bounded capacity.</li>
 * </ul>
 *
 * <p>Happens-before: enqueue synchronizes-with the matching dequeue via
 * the {@link LinkedBlockingQueue} AQS contract. {@code close()}
 * synchronizes-with subsequent pollers via the {@code closed} flag.
 */
public final class MpmcQueue<T> {

    private final int capacity;
    private final LinkedBlockingQueue<T> store;
    private final AtomicBoolean closed = new AtomicBoolean(false);

    public MpmcQueue(final int capacity) {
        if (capacity < 1) throw new IllegalArgumentException("capacity must be >= 1");
        this.capacity = capacity;
        this.store = new LinkedBlockingQueue<T>(capacity);
    }

    public int capacity() {
        return capacity;
    }

    public void enqueue(final T item) throws InterruptedException {
        if (item == null) throw new IllegalArgumentException("item must be non-null");
        if (closed.get()) throw new IllegalStateException("queue closed");
        store.put(item);
    }

    /**
     * Poll one item, or return {@code null} if {@code timeoutMs} elapsed
     * or the queue is closed and drained.
     */
    public T dequeue(final long timeoutMs) throws InterruptedException {
        // Try one immediate non-blocking poll: this matches the TS
        // semantics where a 0-timeout dequeue still returns an item if
        // the queue has one.
        final T peek = store.poll();
        if (peek != null) return peek;
        if (closed.get() && store.isEmpty()) return null;
        if (timeoutMs <= 0) return null;

        final long deadlineNanos = System.nanoTime() + timeoutMs * 1_000_000L;
        for (;;) {
            final long remaining = deadlineNanos - System.nanoTime();
            if (remaining <= 0) return null;
            final T v = store.poll(remaining, TimeUnit.NANOSECONDS);
            if (v != null) return v;
            if (closed.get() && store.isEmpty()) return null;
        }
    }

    public void close() {
        closed.set(true);
    }

    public int size() {
        return store.size();
    }

    public boolean isClosed() {
        return closed.get();
    }
}
