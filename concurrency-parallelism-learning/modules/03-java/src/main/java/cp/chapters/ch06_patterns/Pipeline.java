package cp.chapters.ch06_patterns;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;

/**
 * Cross-language pattern 2 — sequential pipeline of N stages.
 *
 * <p>Mirrors {@code src/cross-lang/pipeline.ts}: one source element is
 * pushed through each stage in turn, producing one output per input.
 * Stages are pure {@link Function}s; if they need side effects they
 * accept and return values through the chain.
 */
public final class Pipeline {

    private Pipeline() {
    }

    /**
     * Run {@code source} through {@code stages} in order; each element is
     * transformed by every stage before the next source element is taken.
     */
    public static <T> List<T> run(final List<Function<T, T>> stages,
                                  final List<T> source) {
        final List<T> out = new ArrayList<T>(source.size());
        for (final T x0 : source) {
            T v = x0;
            for (final Function<T, T> stage : stages) {
                v = stage.apply(v);
            }
            out.add(v);
        }
        return out;
    }

    /**
     * Async variant: each stage can return a {@link CompletableFuture}.
     * The pipeline still produces one output per input but elements can
     * be processed concurrently within a stage. For simplicity the
     * reference (and the cross-language contract) uses synchronous stages.
     */
    public static <T> List<T> runAsync(final List<Function<T, CompletableFuture<T>>> stages,
                                       final List<T> source) {
        final List<T> out = new ArrayList<T>(source.size());
        for (final T x0 : source) {
            T v = x0;
            for (final Function<T, CompletableFuture<T>> stage : stages) {
                v = stage.apply(v).join();
            }
            out.add(v);
        }
        return out;
    }
}
