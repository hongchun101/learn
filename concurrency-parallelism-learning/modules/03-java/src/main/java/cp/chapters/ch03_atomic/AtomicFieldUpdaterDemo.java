package cp.chapters.ch03_atomic;

import java.util.concurrent.atomic.AtomicLongFieldUpdater;
import java.util.concurrent.atomic.AtomicReferenceFieldUpdater;

/**
 * Atomic field updaters — turn an existing {@code volatile} field on a
 * third-party object into a CAS target without altering its class.
 *
 * <p>On Java 8 these are still the tool of choice; in Java 9+ the
 * {@code VarHandle} API replaces them with a slightly nicer surface, but
 * the underlying mechanics are the same (a {@code volatile} store that
 * participates in a total order).
 *
 * <p>Note (per the chapter README): {@code VarHandle} itself is JDK 9+
 * and therefore is NOT used in this Java 8 module.
 */
public final class AtomicFieldUpdaterDemo {

    /** Custom class with a {@code volatile long} field updated through {@link AtomicLongFieldUpdater}. */
    public static final class Vitals {
        private volatile long count;

        public void inc() {
            UPDATER.incrementAndGet(this);
        }

        public long count() {
            return count;
        }

        private static final AtomicLongFieldUpdater<Vitals> UPDATER =
                AtomicLongFieldUpdater.newUpdater(Vitals.class, "count");
    }

    /**
     * Reference-typed updater. We use a non-generic raw class for the
     * updater type because {@code AtomicReferenceFieldUpdater} cannot
     * carry a generic parameter through erasure. The public façade is
     * type-checked in the methods.
     */
    public static final class ObjectBox {
        private volatile Object value;

        public ObjectBox(final Object initial) {
            this.value = initial;
        }

        @SuppressWarnings("unchecked")
        public <T> boolean compareAndSet(final T expected, final T next) {
            return UPDATER.compareAndSet(this, expected, next);
        }

        @SuppressWarnings("unchecked")
        public <T> T get() {
            return (T) value;
        }

        private static final AtomicReferenceFieldUpdater<ObjectBox, Object> UPDATER =
                AtomicReferenceFieldUpdater.newUpdater(ObjectBox.class, Object.class, "value");
    }

    private AtomicFieldUpdaterDemo() {
    }
}
