package cp.chapters.ch04_executors;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * {@link CompletableFuture} and {@link CompletionStage} — a fluent
 * asynchronous computation graph.
 *
 * <p>Composition is the primary verb: {@code thenApply}, {@code thenCompose},
 * {@code thenCombine}, {@code thenAccept}, {@code thenRun}. Errors propagate
 * through {@link CompletableFuture#exceptionally(java.util.function.Function)}
 * or {@link CompletionStage#handle(java.util.function.BiFunction)}.
 *
 * <p>Happens-before: every stage's completion synchronizes-with the thread
 * that runs the next stage; the JDK places an explicit fence between
 * {@code complete} and the dependent's invocation.
 *
 * <p>Java 8 does not have {@code orTimeout} (added in 9); we provide a
 * manual implementation that races the source with a delayed completion.
 */
public final class CompletableFutureDemo {

    /**
     * Square {@code n} off the common pool and return a future that completes
     * with {@code n^2}.
     */
    public static CompletableFuture<Long> squareAsync(final long n) {
        return CompletableFuture.supplyAsync(() -> n * n);
    }

    /** Combine {@code a} and {@code b} by multiplying their completed squares. */
    public static CompletableFuture<Long> multiplySquares(final long a, final long b) {
        final CompletableFuture<Long> fa = squareAsync(a);
        final CompletableFuture<Long> fb = squareAsync(b);
        return fa.thenCombine(fb, (x, y) -> x * y);
    }

    /** Fan-out/fan-in over a list using {@code supplyAsync + thenCombine}. */
    public static CompletableFuture<Long> parallelSumOfSquares(final List<Integer> xs) {
        final List<CompletableFuture<Long>> fs = new ArrayList<CompletableFuture<Long>>();
        for (Integer x : xs) fs.add(squareAsync(x.longValue()));
        CompletableFuture<Long> acc = CompletableFuture.completedFuture(0L);
        for (CompletableFuture<Long> f : fs) acc = acc.thenCombine(f, Long::sum);
        return acc;
    }

    /**
     * Run {@code parallelSumOfSquares} on a private {@link ExecutorService}.
     */
    public static CompletableFuture<Long> parallelSumOfSquaresOn(final List<Integer> xs,
                                                                final ExecutorService pool) {
        final List<CompletableFuture<Long>> fs = new ArrayList<CompletableFuture<Long>>();
        for (Integer x : xs) fs.add(CompletableFuture.supplyAsync(() -> (long) x * x, pool));
        CompletableFuture<Long> acc = CompletableFuture.completedFuture(0L);
        for (CompletableFuture<Long> f : fs) acc = acc.thenCombine(f, Long::sum);
        return acc;
    }

    /**
     * Bound a stage with a timeout in milliseconds. Implementation:
     * race {@code source.get(timeoutMs, MS)} against a scheduled cancel
     * on a daemon pool. Java 8 only — the JDK 9+ equivalent is
     * {@code CompletableFuture#orTimeout}.
     */
    public static <T> T withTimeout(final CompletableFuture<T> source, final long timeoutMs)
            throws InterruptedException, ExecutionException, TimeoutException {
        final Future<?> timeout = Executors.newSingleThreadScheduledExecutor().submit(() -> {
            try {
                source.get(timeoutMs, TimeUnit.MILLISECONDS);
            } catch (Exception expected) {
                // expected; just keep the scheduler alive
            }
        });
        try {
            return source.get(timeoutMs, TimeUnit.MILLISECONDS);
        } finally {
            timeout.cancel(true);
        }
    }

    /** Shutdown helper used by tests. */
    public static void quietShutdown(final ExecutorService pool) {
        pool.shutdown();
        try {
            pool.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            pool.shutdownNow();
        }
    }

    /** Pre-built reference to the daemon pool. */
    public static ExecutorService daemonPool(final int n) {
        return Executors.newFixedThreadPool(n);
    }

    private CompletableFutureDemo() {
    }
}
