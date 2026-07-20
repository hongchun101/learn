package cp.chapters.ch08_locks_advanced;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * Lock downgrading: take the write lock, do an update, atomically acquire
 * the read lock (still holding the write lock), then release the write
 * lock. The thread ends up holding only the read lock, but the transition
 * from write-locked to read-locked was atomic with respect to other
 * threads: no other writer could have intervened.
 *
 * <p>Lock upgrading (read → write) is <b>unsafe</b>: a thread holding the
 * read lock cannot atomically transition to write, so other readers can
 * enter between the two locks and a deadlock is possible.
 */
public final class ReadWriteLockDowngradeDemo {

    /** Map whose updates can be safely read inside the writer's critical section. */
    public static final class DowngradeMap<K, V> {
        private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
        private final Map<K, V> data = new HashMap<K, V>();

        public V putAndKeepRead(final K key, final V value) {
            final Lock w = rw.writeLock();
            final Lock r = rw.readLock();
            w.lock();
            try {
                final V prev = data.put(key, value);
                r.lock();   // atomic acquire, write lock still held
            } finally {
                w.unlock(); // now we hold only the read lock
            }
            try {
                return data.get(key); // safe to read
            } finally {
                r.unlock();
            }
        }

        public V get(final K key) {
            rw.readLock().lock();
            try {
                return data.get(key);
            } finally {
                rw.readLock().unlock();
            }
        }
    }

    private ReadWriteLockDowngradeDemo() {
    }
}
