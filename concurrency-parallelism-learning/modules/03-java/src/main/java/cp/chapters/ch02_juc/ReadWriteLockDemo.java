package cp.chapters.ch02_juc;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * {@link ReentrantReadWriteLock} — many concurrent readers, exclusive writer.
 *
 * <p>The read-lock is shared, so any number of threads can hold it
 * simultaneously. The write-lock is exclusive, so it waits until all
 * readers have released. Both lock types are reentrant.
 *
 * <p>Happens-before: lock acquisition synchronizes-with the matching
 * release on every reader/writer transition. A {@code writeLock().unlock()}
 * happens-before any subsequent {@code readLock().lock()} that observes it,
 * so writers' updates become visible to readers without additional
 * {@code volatile} or {@code synchronized} markup.
 */
public final class ReadWriteLockDemo {

    /** A {@link Map} guarded by a {@link ReentrantReadWriteLock}. */
    public static final class GuardedMap<K, V> {
        private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
        private final Map<K, V> data = new HashMap<K, V>();

        public V get(final K key) {
            rw.readLock().lock();
            try {
                return data.get(key);
            } finally {
                rw.readLock().unlock();
            }
        }

        public V put(final K key, final V value) {
            rw.writeLock().lock();
            try {
                return data.put(key, value);
            } finally {
                rw.writeLock().unlock();
            }
        }

        public int size() {
            rw.readLock().lock();
            try {
                return data.size();
            } finally {
                rw.readLock().unlock();
            }
        }
    }

    private ReadWriteLockDemo() {
    }
}
