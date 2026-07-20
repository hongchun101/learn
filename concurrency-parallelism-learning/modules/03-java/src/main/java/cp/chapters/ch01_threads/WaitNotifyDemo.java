package cp.chapters.ch01_threads;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Classic single-slot producer/consumer built directly from {@code wait()}
 * and {@code notify()}. Pre-Java-5 style; everything here still works on
 * Java 8 and is the foundation that {@link java.util.concurrent} builds on.
 *
 * <p><b>Happens-before.</b> {@code Object.wait()} releases the monitor and
 * atomically reacquires it upon wake-up; the wake-up is paired with a
 * preceding {@code notify()} (or {@code notifyAll()}), and the notify edge
 * happens-before the wait edge in JLS §17.4.4. Use {@code notifyAll()} by
 * default unless you have proven otherwise — {@code notify()} with a single
 * monitor can miss wakeups on some JVMs and is a textbook source of bugs.
 */
public final class WaitNotifyDemo {

    /** Bounded one-slot buffer guarded by intrinsic locks. */
    public static final class OneSlot<T> {
        private final Deque<T> buf = new ArrayDeque<>(1);

        public synchronized void put(final T item) throws InterruptedException {
            while (!buf.isEmpty()) {
                wait();
            }
            buf.addLast(item);
            notifyAll();
        }

        public synchronized T take() throws InterruptedException {
            while (buf.isEmpty()) {
                wait();
            }
            final T item = buf.removeFirst();
            notifyAll();
            return item;
        }

        public synchronized boolean isEmpty() {
            return buf.isEmpty();
        }
    }

    private WaitNotifyDemo() {
    }
}
