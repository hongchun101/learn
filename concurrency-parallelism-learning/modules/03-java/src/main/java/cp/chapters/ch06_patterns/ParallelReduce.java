package cp.chapters.ch06_patterns;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.BinaryOperator;

/**
 * Cross-language pattern 6 — parallel reduction.
 *
 * <p>Mirrors {@code src/cross-lang/reduce.ts}: split into P chunks,
 * reduce each chunk sequentially, then combine partials left-to-right.
 * Correctness requires an <i>associative</i> {@code combine} — caller
 * guarantees that.
 *
 * <p>The result equals the sequential {@code inputs.reduce(combine)}
 * because:
 * <ol>
 *   <li>the per-chunk reduce is {@code combine(....combine(x0, x1), x2)};
 *       denote each chunk's value {@code c[i]} = {@code x_{from_i} ∘ …
 *       ∘ x_{to_i - 1}}.</li>
 *   <li>the merge left-to-right yields {@code c[0] ∘ c[1] ∘ … ∘ c[p-1]}.</li>
 *   <li>by associativity, the chunk boundaries are immaterial, so the
 *       result equals the all-elements-in-order reduce.</li>
 * </ol>
 */
public final class ParallelReduce {

    private ParallelReduce() {
    }

    /**
     * Run a parallel reduce over {@code inputs} with the
     * (associative) {@code combine} operation, using {@code parallelism}
     * workers on a fresh executor.
     */
    public static <T> T run(final BinaryOperator<T> combine,
                            final List<? extends T> inputs,
                            final int parallelism) throws Exception {
        if (inputs.isEmpty()) throw new IllegalArgumentException("cannot reduce empty");
        final int p = Math.max(1, Math.min(parallelism, inputs.size()));
        if (p == 1) {
            T acc = inputs.get(0);
            for (int i = 1; i < inputs.size(); i++) acc = combine.apply(acc, inputs.get(i));
            return acc;
        }
        final ExecutorService pool = Executors.newFixedThreadPool(p);
        try {
            final List<? extends T> list = inputs;
            final int size = list.size();
            final int chunk = (size + p - 1) / p;
            final List<Future<T>> partials = new ArrayList<Future<T>>();
            for (int i = 0; i < p; i++) {
                final int from = i * chunk;
                final int to = Math.min(from + chunk, size);
                if (from >= size) break;
                partials.add(pool.submit(() -> {
                    T acc = list.get(from);
                    for (int j = from + 1; j < to; j++) acc = combine.apply(acc, list.get(j));
                    return acc;
                }));
            }
            T acc = partials.get(0).get();
            for (int i = 1; i < partials.size(); i++) acc = combine.apply(acc, partials.get(i).get());
            return acc;
        } finally {
            pool.shutdown();
            if (!pool.awaitTermination(5, TimeUnit.SECONDS)) pool.shutdownNow();
        }
    }
}
