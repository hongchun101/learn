package cp.chapters.ch03_atomic;

import java.util.concurrent.atomic.LongAdder;

/**
 * {@link LongAdder} — a striped counter designed for high write contention.
 *
 * <p>{@link LongAdder} maintains an array of {@code Cell}s and updates a
 * randomly chosen cell on each {@code add()} call; {@code sum()} folds the
 * cells back together. Writes contend on different cells, so on hot
 * counters it scales nearly linearly with core count while still
 * delivering an exact (eventually-consistent) total.
 *
 * <p>Note: {@code sum()} is not atomic w.r.t. ongoing {@code add()}s; if
 * you need a consistent snapshot, use {@code sumThenReset()} or under a
 * read mostly regime prefer {@link java.util.concurrent.atomic.AtomicLong}.
 *
 * <p>Happens-before: each {@code add()} is itself a synchronizes-with on
 * the cell it touches. {@code sum()} is a sequential fold over all cells.
 */
public final class LongAdderDemo {

    /** Bench counter; use {@code sum()} for totals, {@code intValue()} for the lower bits. */
    public static final class BenchCounter {
        private final LongAdder adder = new LongAdder();

        public void hit() {
            adder.increment();
        }

        public long total() {
            return adder.sum();
        }

        public void reset() {
            adder.reset();
        }
    }

    private LongAdderDemo() {
    }
}
