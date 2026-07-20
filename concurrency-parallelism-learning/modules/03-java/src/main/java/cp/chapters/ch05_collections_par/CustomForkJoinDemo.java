package cp.chapters.ch05_collections_par;

import java.util.concurrent.RecursiveTask;

/**
 * A custom {@link RecursiveTask} that maps {@code [from, to)} over a
 * user-supplied function and sums the int outputs. Demonstrates the
 * standard fork-then-join recipe and the right place to call
 * {@code fork()} versus {@code compute()}.
 */
public final class CustomForkJoinDemo {

    /** Compute {@code sum_{i=from}^{to-1} f(i)} via fork-join. */
    public static final class SumMapper extends RecursiveTask<Long> {
        private static final long serialVersionUID = 1L;
        private static final int THRESHOLD = 4096;
        private final int from;
        private final int to;
        private final java.util.function.IntToLongFunction f;

        public SumMapper(final int from, final int to, final java.util.function.IntToLongFunction f) {
            this.from = from;
            this.to = to;
            this.f = f;
        }

        @Override
        protected Long compute() {
            final int span = to - from;
            if (span <= THRESHOLD) {
                long s = 0;
                for (int i = from; i < to; i++) s += f.applyAsLong(i);
                return s;
            }
            final int mid = from + span / 2;
            // fork the left, compute the right in this thread — recursion on right
            final SumMapper left = new SumMapper(from, mid, f);
            left.fork();
            final SumMapper right = new SumMapper(mid, to, f);
            return right.compute() + left.join();
        }
    }

    /** Run {@code sumMapper} on the common pool. */
    public static long runOnCommon(final int from, final int to,
                                   final java.util.function.IntToLongFunction f) {
        return java.util.concurrent.ForkJoinPool.commonPool()
                .invoke(new SumMapper(from, to, f));
    }

    private CustomForkJoinDemo() {
    }
}
