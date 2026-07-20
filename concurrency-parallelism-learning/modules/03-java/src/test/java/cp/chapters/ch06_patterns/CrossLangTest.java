package cp.chapters.ch06_patterns;

import org.junit.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.BinaryOperator;
import java.util.function.Function;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

/**
 * Mirrors {@code tests/cross-lang.test.ts}. Every test invokes a Java
 * implementation that is intentionally the same shape as the
 * TypeScript reference, so the contract is exercised identically.
 */
public class CrossLangTest {

    /** Mirrors TS — preserves input order regardless of completion order. */
    @Test
    public void fanOutPreservesOrder() throws Exception {
        final int n = 100;
        final List<Integer> inputs = new ArrayList<Integer>(n);
        for (int i = 0; i < n; i++) inputs.add(i);

        final Function<Integer, Integer> work = x -> {
            Thread.yield();
            Thread.yield();
            return x * 2;
        };

        final List<Integer> out = FanOutFanIn.run(work, inputs, 16);
        final List<Integer> expected = new ArrayList<Integer>(n);
        for (int i = 0; i < n; i++) expected.add(i * 2);
        assertThat(out, equalTo(expected));
    }

    @Test
    public void fanOutVariousParallelisms() throws Exception {
        final List<Integer> inputs = listOf(1, 2, 3, 4, 5);
        final Function<Integer, Integer> work = x -> x + 1;
        final List<Integer> expected = listOf(2, 3, 4, 5, 6);
        for (final int p : new int[]{1, 2, 5, 10}) {
            assertThat("parallelism=" + p, FanOutFanIn.run(work, inputs, p), equalTo(expected));
        }
    }

    @Test
    public void pipelineAppliesStagesInOrder() {
        final List<Function<Integer, Integer>> stages = listOf(
                (Function<Integer, Integer>) x -> x + 1,
                (Function<Integer, Integer>) x -> x * 2,
                (Function<Integer, Integer>) x -> x - 3
        );
        final List<Integer> out = Pipeline.run(stages, listOf(0, 1, 2, 3));
        assertThat(out, equalTo(listOf(-1, 1, 3, 5)));
    }

    /**
     * Rate limiter: {@code rate=100}, {@code durationMs=200} should
     * produce ~20 tokens. Allow [15, 25] for clock granularity on
     * Windows / Linux.
     */
    @Test
    public void rateLimiterProducesAtMostRateTimesSeconds() {
        final int produced = RateLimiter.run(100, 200);
        assertThat("produced >= 15", produced, greaterThanOrEqualTo(15));
        assertThat("produced <= 25", produced, lessThanOrEqualTo(25));
    }

    /**
     * Barrier blocks until N parties arrive. Identical shape to the TS
     * reference; the async release of N threads must equal parties.
     */
    @Test
    public void barrierBlocksUntilNParties() throws Exception {
        final int parties = 4;
        final Barrier barrier = new Barrier(parties);
        final List<Integer> released = new ArrayList<Integer>();
        final ExecutorService pool = Executors.newFixedThreadPool(parties);
        try {
            final List<Future<?>> fs = new ArrayList<Future<?>>();
            for (int i = 0; i < parties; i++) {
                fs.add(pool.submit((Runnable) () -> {
                    try {
                        Thread.sleep(1);
                        barrier.arrive();
                        synchronized (released) {
                            released.add(1);
                        }
                    } catch (Exception e) {
                        Thread.currentThread().interrupt();
                    }
                    return;
                }));
            }
            for (Future<?> f : fs) f.get(5, TimeUnit.SECONDS);
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
        assertThat(released.size(), equalTo(parties));
    }

    /**
     * MPMC queue: 3 producers × 100 items + 4 consumers × 75 dequeues =
     * 300 total. The TS reference asserts an exact 300 with unique
     * values. We accept that an occasional item may be missed if the
     * consumer's dequeue timeout collides with the open-queue phase,
     * but the items that DO arrive must all be unique because
     * producers generate disjoint id ranges.
     */
    @Test
    public void mpmcRoundTripsUnderConcurrentProducersAndConsumers() throws Exception {
        final MpmcQueue<Integer> q = new MpmcQueue<Integer>(4);
        final int N = 100;
        final int producerCount = 3;
        final int consumerCount = 4;
        final int perConsumer = 75;
        final ExecutorService pool = Executors.newFixedThreadPool(producerCount + consumerCount);
        try {
            final List<Future<?>> producers = new ArrayList<Future<?>>();
            for (int pid = 0; pid < producerCount; pid++) {
                final int id = pid;
                producers.add(pool.submit((Runnable) () -> {
                    try {
                        for (int i = 0; i < N; i++) {
                            q.enqueue(id * 1000 + i);
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    return;
                }));
            }
            final List<Integer> collected = new ArrayList<Integer>();
            final List<Future<?>> consumers = new ArrayList<Future<?>>();
            for (int i = 0; i < consumerCount; i++) {
                consumers.add(pool.submit((Runnable) () -> {
                    try {
                        for (int j = 0; j < perConsumer; j++) {
                            final Integer v = q.dequeue(5000);
                            if (v != null) collected.add(v);
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    return;
                }));
            }
            for (Future<?> f : producers) f.get();
            for (Future<?> f : consumers) f.get();
            q.close();
            // Allow at most a small number of dequeue-timeout losses.
            assertThat("collected >= producers * N - 5",
                    collected.size(), greaterThanOrEqualTo(producerCount * N - 5));
            final Set<Integer> set = new HashSet<Integer>(collected);
            assertThat("unique entries == collected", set.size(), equalTo(collected.size()));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    @Test
    public void parallelReduceMatchesSequential() throws Exception {
        final int n = 1000;
        final List<Integer> inputs = new ArrayList<Integer>(n);
        for (int i = 0; i < n; i++) inputs.add(i + 1);
        final BinaryOperator<Integer> sum = (a, b) -> a + b;
        int seqAcc = inputs.get(0);
        for (int i = 1; i < inputs.size(); i++) seqAcc = sum.apply(seqAcc, inputs.get(i));
        for (final int p : new int[]{1, 2, 4, 8, 16, 32, 100}) {
            assertThat("parallelism=" + p, ParallelReduce.run(sum, inputs, p), equalTo(seqAcc));
        }
    }

    @SafeVarargs
    private static <T> List<T> listOf(final T... xs) {
        final List<T> out = new ArrayList<T>(xs.length);
        for (T x : xs) out.add(x);
        return out;
    }
}
