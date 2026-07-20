package cp.chapters.ch02_juc;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * {@link ConcurrentHashMap} — the workhorse concurrent map.
 *
 * <p>On Java 8 the implementation switched to a bucket-locking, tree-on-
 * overload design that gives lock-free reads for the common case while
 * keeping writes thread-safe. {@link ConcurrentHashMap#compute},
 * {@link ConcurrentHashMap#merge}, and {@link ConcurrentHashMap#computeIfAbsent}
 * are <i>atomic</i> w.r.t. the key — useful for compound operations.
 *
 * <p>Happens-before: the JMM contract for {@link ConcurrentHashMap} (JSR-166
 * §4.4) guarantees that actions in a thread before {@code put} are visible
 * to a thread that subsequently {@code get}s the same key, even across
 * resizes.
 */
public final class ConcurrentMapDemo {

    /** Word counter built on top of {@link ConcurrentHashMap}. */
    public static final class WordCounter {
        private final ConcurrentHashMap<String, AtomicLong> counts = new ConcurrentHashMap<String, AtomicLong>();

        public void increment(final String word) {
            counts.computeIfAbsent(word, new java.util.function.Function<String, AtomicLong>() {
                @Override
                public AtomicLong apply(final String k) {
                    return new AtomicLong();
                }
            }).incrementAndGet();
        }

        public long count(final String word) {
            final AtomicLong v = counts.get(word);
            return v == null ? 0L : v.get();
        }

        public Map<String, Long> snapshot() {
            final Map<String, Long> out = new java.util.HashMap<String, Long>();
            counts.forEach(new java.util.function.BiConsumer<String, AtomicLong>() {
                @Override
                public void accept(final String k, final AtomicLong v) {
                    out.put(k, v.get());
                }
            });
            return out;
        }
    }

    private ConcurrentMapDemo() {
    }
}
