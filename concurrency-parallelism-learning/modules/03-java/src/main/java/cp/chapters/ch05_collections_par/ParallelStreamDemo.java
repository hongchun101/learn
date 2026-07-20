package cp.chapters.ch05_collections_par;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BinaryOperator;

/**
 * {@code parallelStream()} — fork-join over a collection.
 *
 * <p>The streams framework provides {@code Collection.parallelStream()}
 * which is implemented on top of {@link java.util.concurrent.ForkJoinPool}.
 * Operations on a parallel pipeline respect the stream's
 * {@code encounter order} by default; unordered pipelines can save a
 * pipeline-final barrier.
 *
 * <p>Side-effects in {@code map}/{@code filter} are unsafe; reduce and
 * {@code collect} are designed to be associative and thread-safe. We
 * demonstrate a thread-safe accumulator based on
 * {@link ConcurrentLinkedQueue}.
 */
public final class ParallelStreamDemo {

    /** Safe parallel accumulator using a lock-free queue. */
    public static final class ConcurrentLongAccumulator {
        private final ConcurrentLinkedQueue<Long> samples = new ConcurrentLinkedQueue<Long>();
        private final AtomicLong sum = new AtomicLong();

        public void accept(final long v) {
            sum.addAndGet(v);
            samples.add(v);
        }

        public long sum() {
            return sum.get();
        }

        public int count() {
            return samples.size();
        }

        public ConcurrentLongAccumulator merge(final ConcurrentLongAccumulator other) {
            sum.addAndGet(other.sum.get());
            return this;
        }
    }

    /** Sum of {@code ints} computed in parallel. */
    public static long parallelSum(final List<Integer> xs) {
        return xs.parallelStream().mapToLong(Integer::longValue).sum();
    }

    /** Sum of {@code ints} computed sequentially. */
    public static long sequentialSum(final List<Integer> xs) {
        long s = 0;
        for (int v : xs) s += v;
        return s;
    }

    /** A custom parallel reduce over a list with an associative op. */
    public static <T> T parallelReduce(final List<T> xs, final BinaryOperator<T> op) {
        return xs.parallelStream().reduce(op::apply).orElseThrow(new java.util.function.Supplier<RuntimeException>() {
            @Override
            public RuntimeException get() {
                return new IllegalStateException("empty");
            }
        });
    }

    public static List<Integer> rangeList(final int n) {
        final List<Integer> xs = new ArrayList<Integer>(n);
        for (int i = 0; i < n; i++) xs.add(i);
        return xs;
    }

    private ParallelStreamDemo() {
    }
}
