package cp.chapters.ch02_juc;

import java.util.concurrent.Exchanger;

/**
 * {@link Exchanger} — two-party swap. {@code exchange(value)} blocks until
 * another thread arrives and hands over its value; each side leaves with
 * the other's value. Useful for hand-offs in pipelines where two stages
 * benefit from running simultaneously.
 *
 * <p>Happens-before: each {@code exchange()} returns a value written by the
 * counterpart. JLS §17.4.5 + AQS contract guarantee that the writes
 * preceding the partner's {@code exchange()} happen-before the return.
 */
public final class ExchangerDemo {

    /** Pair-wise exchanger; each side hands its slot to the other. */
    public static final class PairPipe<T> {
        private final Exchanger<T> exchanger = new Exchanger<T>();

        /** Hand {@code mine} off, return the partner's value. */
        public T swap(final T mine) throws InterruptedException {
            return exchanger.exchange(mine);
        }
    }

    private ExchangerDemo() {
    }
}
