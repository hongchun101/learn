package cp.chapters.ch01_threads;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

/**
 * {@link ThreadLocal} and {@link InheritableThreadLocal} demos.
 *
 * <p>A {@code ThreadLocal} keeps a distinct value per thread; reads and writes
 * from different threads are independent. The Java Memory Model does not
 * need to publish the value across threads because there is no sharing.
 *
 * <p>{@link InheritableThreadLocal} copies the parent's value into the child
 * thread at thread creation time, so the child sees the parent's value
 * <i>at that moment</i>; further writes in the parent do not retroactively
 * change the child's copy. This is documented behaviour, not a race.
 */
public final class ThreadLocalDemo {

    /**
     * Per-thread counter implemented with {@link ThreadLocal}. Each thread
     * sees its own sequence; threads don't interfere with each other.
     */
    public static final class PerThreadCounter {
        private static final AtomicInteger IDS = new AtomicInteger();
        private final ThreadLocal<int[]> holder = ThreadLocal.withInitial(() -> new int[]{ IDS.incrementAndGet(), 0 });

        public int id() {
            return holder.get()[0];
        }

        public int next() {
            final int[] h = holder.get();
            h[1]++;
            return h[1];
        }

        public int current() {
            return holder.get()[1];
        }
    }

    /** {@link InheritableThreadLocal} initial value is taken at child-thread creation. */
    public static final class InheritableBox<T> {
        private final InheritableThreadLocal<T> ref;

        public InheritableBox(final Supplier<T> initial) {
            this.ref = new InheritableThreadLocal<T>() {
                @Override
                protected T initialValue() {
                    return initial.get();
                }
            };
        }

        public T get() {
            return ref.get();
        }

        public void set(final T v) {
            ref.set(v);
        }
    }

    private ThreadLocalDemo() {
    }
}
