package cp.chapters.ch02_juc;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingDeque;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.PriorityBlockingQueue;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.TimeUnit;

/**
 * Walking tour of the {@link BlockingQueue} family.
 *
 * <ul>
 *   <li>{@link ArrayBlockingQueue} — bounded, array-backed, FIFO.</li>
 *   <li>{@link LinkedBlockingQueue} — optionally bounded, linked nodes.</li>
 *   <li>{@link LinkedBlockingDeque} — optionally bounded, double-ended.</li>
 *   <li>{@link PriorityBlockingQueue} — unbounded, priority-ordered.</li>
 *   <li>{@link SynchronousQueue} — zero capacity; each {@code put} needs a
 *       concurrent {@code take}.</li>
 * </ul>
 *
 * <p>Happens-before: any successful {@code put}/{@code offer} (without
 * throwing {@code IllegalStateException}) synchronizes-with the matching
 * {@code take}/{@code poll}. So the {@link BlockingQueue} contract is the
 * canonical place producers and consumers agree on visibility.
 */
public final class BlockingQueuesDemo {

    public static BlockingQueue<Integer> boundedFifo(final int capacity) {
        return new ArrayBlockingQueue<Integer>(capacity);
    }

    public static BlockingQueue<Integer> linkedFifo(final int capacity) {
        return new LinkedBlockingQueue<Integer>(capacity);
    }

    public static BlockingQueue<Integer> linkedDeque(final int capacity) {
        return new LinkedBlockingDeque<Integer>(capacity);
    }

    public static BlockingQueue<Integer> priority() {
        return new PriorityBlockingQueue<Integer>();
    }

    public static BlockingQueue<Integer> synchronous() {
        return new SynchronousQueue<Integer>();
    }

    /**
     * Drains a queue with a total timeout; returns the count collected.
     * Demonstrates the {@code poll(timeout, unit)} API.
     */
    public static int drainWithTimeout(final BlockingQueue<Integer> q, final int maxItems,
                                       final long timeoutMs) throws InterruptedException {
        int n = 0;
        final long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (n < maxItems) {
            final long remaining = deadline - System.nanoTime();
            if (remaining <= 0) break;
            final Integer v = q.poll(remaining, TimeUnit.NANOSECONDS);
            if (v == null) break;
            n++;
        }
        return n;
    }

    private BlockingQueuesDemo() {
    }
}
