package cp.chapters.ch06_patterns;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

/**
 * Cross-language pattern 1 — fan-out/fan-in over a worker pool.
 *
 * <p>Mirrors {@code src/cross-lang/fanout.ts}: N inputs, P workers,
 * output array preserves input order. Implemented on top of
 * {@link CompletableFuture} so we get composition for free, but the
 * essential shape (cursor + worker loop + completed-futures) is the same.
 *
 * <p>Happens-before: each worker's writes to its slot in the output
 * array happen-before the {@code allOf} future that joins all workers
 * completes; the result list is built from those slots after the join.
 */
public final class FanOutFanIn {

    private FanOutFanIn() {
    }

    /**
     * Run {@code work(input)} for every {@code input}, with at most
     * {@code parallelism} workers, and return results in input order.
     */
    public static <I, O> List<O> run(final Function<I, O> work,
                                     final List<? extends I> inputs,
                                     final int parallelism) throws InterruptedException {
        if (parallelism < 1) {
            throw new IllegalArgumentException("parallelism must be >= 1");
        }
        final int actual = Math.min(parallelism, Math.max(inputs.size(), 1));
        final ExecutorService pool = Executors.newFixedThreadPool(actual);
        try {
            final AtomicInteger cursor = new AtomicInteger();
            @SuppressWarnings("unchecked")
            final CompletableFuture<O>[] slots = new CompletableFuture[inputs.size()];
            final List<CompletableFuture<Void>> runners = new ArrayList<CompletableFuture<Void>>();
            for (int w = 0; w < actual; w++) {
                runners.add(CompletableFuture.runAsync(new Runnable() {
                    @Override
                    public void run() {
                        for (;;) {
                            final int i = cursor.getAndIncrement();
                            if (i >= inputs.size()) return;
                            slots[i] = CompletableFuture.completedFuture(work.apply(inputs.get(i)));
                        }
                    }
                }, pool));
            }
            CompletableFuture.allOf(runners.toArray(new CompletableFuture[0])).join();
            final List<O> out = new ArrayList<O>(inputs.size());
            for (int i = 0; i < inputs.size(); i++) {
                out.add(slots[i].join());
            }
            return out;
        } finally {
            pool.shutdown();
            if (!pool.awaitTermination(5, TimeUnit.SECONDS)) pool.shutdownNow();
        }
    }
}
