package cp.chapters.ch04_executors;

import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.RecursiveTask;

/**
 * {@link ForkJoinPool} — work-stealing pool of daemon workers, designed
 * for divide-and-conquer tasks. Each worker maintains its own deque; idle
 * workers steal from the bottom of busy peers' deques, giving excellent
 * load balancing for recursive computations.
 *
 * <p>Two flavors of {@link RecursiveTask}:
 * <ul>
 *   <li>{@code compute()} returns a value (fork then join).</li>
 *   <li>{@code RecursiveAction} runs for side-effect.</li>
 * </ul>
 *
 * <p>Happens-before: a task's {@code join()} (or {@code invoke()}) establishes
 * a happens-before edge with the task's writes inside {@code compute()}.
 */
public final class ForkJoinDemo {

    /** Sum of squares via divide-and-conquer. */
    public static final class SumSquares extends RecursiveTask<Long> {
        private static final long serialVersionUID = 1L;
        private static final long THRESHOLD = 1024L;
        private final long from;
        private final long to;

        public SumSquares(final long from, final long to) {
            this.from = from;
            this.to = to;
        }

        @Override
        protected Long compute() {
            final long span = to - from;
            if (span <= THRESHOLD) {
                long s = 0;
                for (long i = from; i < to; i++) s += i * i;
                return s;
            }
            final long mid = from + span / 2;
            final SumSquares left = new SumSquares(from, mid);
            final SumSquares right = new SumSquares(mid, to);
            left.fork();
            return right.compute() + left.join();
        }
    }

    /** Compute {@code sum of squares of [0, n)} on the common pool. */
    public static long sumSquaresCommon(final long n) {
        return ForkJoinPool.commonPool().invoke(new SumSquares(0L, n));
    }

    /** Compute on a fresh {@link ForkJoinPool} of {@code parallelism} workers. */
    public static long sumSquaresOn(final int parallelism, final long n) {
        final ForkJoinPool pool = new ForkJoinPool(parallelism);
        try {
            return pool.invoke(new SumSquares(0L, n));
        } finally {
            pool.shutdown();
        }
    }

    private ForkJoinDemo() {
    }
}
