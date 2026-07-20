package cp.chapters.ch02_juc;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * {@link CopyOnWriteArrayList} — snapshot-on-write semantics.
 *
 * <p>Reads are wait-free and lock-free; they walk the current array
 * snapshot. Every mutation allocates a fresh array copy of the current
 * snapshot, writes through, then publishes the new array. Iterators are
 * weakly consistent: they see the snapshot they were created with, even
 * if the underlying list is replaced.
 *
 * <p>Happens-before: a put that publishes a new array synchronizes-with
 * every read that observes that array. The {@code volatile} array
 * reference acts as the publication point (JSR-133 / JLS §17.4).
 */
public final class CopyOnWriteDemo {

    /** Listener list where listeners can subscribe during event dispatch. */
    public static final class Listeners {
        private final List<Runnable> listeners = new CopyOnWriteArrayList<Runnable>();

        public void add(final Runnable r) {
            listeners.add(r);
        }

        public void remove(final Runnable r) {
            listeners.remove(r);
        }

        public void fire() {
            for (Runnable r : listeners) r.run();
        }

        public int size() {
            return listeners.size();
        }
    }

    private CopyOnWriteDemo() {
    }
}
