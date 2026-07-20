package cp.chapters.ch04_executors;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * {@link ExecutorService} — pool-based task execution.
 *
 * <p>{@link Executors#newFixedThreadPool(int)} returns a backed
 * {@link java.util.concurrent.ThreadPoolExecutor} with an unbounded queue.
 * Pre-built configurations are convenient; for production code, prefer
 * the {@link java.util.concurrent.ThreadPoolExecutor} constructor with
 * named bounds and a bounded queue.
 *
 * <p>Happens-before: a task submitted to an executor service starts after
 * {@code execute}/{@code submit} returns; the {@link Future#get} unblocks
 * after the task writes return value or completes, and that synchronizes
 * the task's last action with the caller's subsequent reads.
 */
public final class ExecutorServiceDemo {

    /** Sum of squares of {@code 0..n-1} computed across {@code parallelism} workers. */
    public static long sumOfSquares(final int n, final int parallelism)
            throws InterruptedException, ExecutionException {
        final ExecutorService pool = Executors.newFixedThreadPool(parallelism);
        try {
            final List<Future<Long>> futures = new ArrayList<Future<Long>>();
            final int chunkSize = (n + parallelism - 1) / parallelism;
            for (int t = 0; t < parallelism; t++) {
                final int start = t * chunkSize;
                final int end = Math.min(start + chunkSize, n);
                futures.add(pool.submit(new Callable<Long>() {
                    @Override
                    public Long call() {
                        long s = 0;
                        for (int i = start; i < end; i++) s += (long) i * i;
                        return s;
                    }
                }));
            }
            long total = 0;
            for (Future<Long> f : futures) total += f.get();
            return total;
        } finally {
            pool.shutdown();
            if (!pool.awaitTermination(5, TimeUnit.SECONDS)) pool.shutdownNow();
        }
    }

    private ExecutorServiceDemo() {
    }
}
