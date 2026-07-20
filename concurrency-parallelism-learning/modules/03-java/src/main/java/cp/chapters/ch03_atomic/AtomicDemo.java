package cp.chapters.ch03_atomic;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicStampedReference;

/**
 * Chapter 3 — Atomic primitives.
 *
 * <p>The {@code java.util.concurrent.atomic} package offers lock-free
 * primitives with the same happens-before semantics as monitor release/
 * acquire. Each method on an atomic is itself a synchronizes-with edge:
 * {@code set()}/{@code lazySet()} vs {@code get()} acquire vs release.
 *
 * <p>Happens-before: writing through a {@link AtomicInteger#getAndSet} or
 * {@link AtomicReference#compareAndSet} is a total order that
 * synchronizes-with subsequent reads of the same variable from any
 * thread. So locks are not required to publish state through an atomic.
 */
public final class AtomicDemo {

    /** Compare-and-swap loop with CAS, used to implement a lock-free counter. */
    public static final class CasCounter {
        private final AtomicInteger ai = new AtomicInteger();

        public int increment() {
            for (;;) {
                final int current = ai.get();
                final int next = current + 1;
                if (ai.compareAndSet(current, next)) return next;
            }
        }

        public int get() {
            return ai.get();
        }
    }

    /** ABA-safe lock-free stack using {@link AtomicStampedReference}. */
    public static final class Node<T> {
        final T value;
        Node<T> next;

        Node(final T value, final Node<T> next) {
            this.value = value;
            this.next = next;
        }
    }

    public static final class StampStack<T> {
        private final AtomicStampedReference<Node<T>> head =
                new AtomicStampedReference<Node<T>>(null, 0);

        public void push(final T value) {
            for (;;) {
                final Node<T> currentHead = head.getReference();
                final int stamp = head.getStamp();
                final Node<T> newHead = new Node<T>(value, currentHead);
                if (head.compareAndSet(currentHead, newHead, stamp, stamp + 1)) return;
            }
        }

        public T pop() {
            for (;;) {
                final Node<T> currentHead = head.getReference();
                final int stamp = head.getStamp();
                if (currentHead == null) return null;
                final Node<T> newHead = currentHead.next;
                if (head.compareAndSet(currentHead, newHead, stamp, stamp + 1)) {
                    return currentHead.value;
                }
            }
        }

        public int size() {
            int n = 0;
            for (Node<T> n1 = head.getReference(); n1 != null; n1 = n1.next) n++;
            return n;
        }
    }

    /** Generic lock-free exchange point for one-slot publish/subscribe. */
    public static final class Holder<T> {
        private final AtomicReference<T> ref = new AtomicReference<T>();

        public T get() {
            return ref.get();
        }

        public void set(final T value) {
            ref.set(value);
        }

        public boolean compareAndSet(final T expected, final T next) {
            return ref.compareAndSet(expected, next);
        }
    }

    private AtomicDemo() {
    }
}
