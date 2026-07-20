package cp.chapters.ch05_collections_par;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.RecursiveAction;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Work-stealing illustration. Each task does a small unit of work and
 * submits subtasks via {@code fork()}. When a worker completes its local
 * deque it steals from other workers — the {@link ForkJoinPool#getStealCount()}
 * metric exposes the volume of steals.
 */
public final class WorkStealingDemo {

    /** Trivial parallel action: each leaf increments a shared counter by its span. */
    public static final class UnitTask extends RecursiveAction {
        private static final long serialVersionUID = 1L;
        private static final int THRESHOLD = 1000;
        private final int from;
        private final int to;
        private final AtomicInteger counter;

        public UnitTask(final int from, final int to, final AtomicInteger counter) {
            this.from = from;
            this.to = to;
            this.counter = counter;
        }

        @Override
        protected void compute() {
            final int span = to - from;
            if (span <= THRESHOLD) {
                counter.addAndGet(span);
                return;
            }
            final int mid = from + span / 2;
            final UnitTask left = new UnitTask(from, mid, counter);
            final UnitTask right = new UnitTask(mid, to, counter);
            // fork left, compute right, then join left — typical fork-join recipe
            left.fork();
            right.compute();
            left.join();
        }
    }

    /**
     * Run {@code n} unit operations split across {@code parallelism} workers
     * and report the steal count.
     */
    public static long runAndReportSteals(final int n, final int parallelism) {
        final ForkJoinPool pool = new ForkJoinPool(parallelism);
        try {
            final AtomicInteger counter = new AtomicInteger();
            pool.invoke(new UnitTask(0, n, counter));
            return counter.get();
        } finally {
            pool.shutdown();
        }
    }

    /**
     * Manually fan-out 10 small actions to simulate uneven load, then
     * verify the steal count is non-negative. Useful in tests.
     */
    public static long unevenStealsDemo(final int parallelism) {
        final ForkJoinPool pool = new ForkJoinPool(parallelism);
        try {
            final AtomicInteger counter = new AtomicInteger();
            final List<RecursiveAction> tasks = new ArrayList<RecursiveAction>();
            for (int i = 0; i < 10; i++) {
                tasks.add(new UnitTask(i * 1000, (i + 1) * 1000 + i * 100, counter));
            }
            pool.invoke(new RecursiveAction() {
                private static final long serialVersionUID = 1L;

                @Override
                protected void compute() {
                    invokeAll(tasks.toArray(new RecursiveAction[0]));
                }
            });
            return pool.getStealCount();
        } finally {
            pool.shutdown();
        }
    }

    private WorkStealingDemo() {
    }
}
