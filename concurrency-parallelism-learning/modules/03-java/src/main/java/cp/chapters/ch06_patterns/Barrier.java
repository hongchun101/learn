package cp.chapters.ch06_patterns;

/**
 * Cross-language pattern 4 — N-party barrier.
 *
 * <p>Mirrors {@code src/cross-lang/barrier.ts}: {@code arrive()} blocks
 * the caller until {@code parties} arrivals have been seen since the
 * last reset, then unblocks all waiters.
 *
 * <p>Implementation note: we synchronize on the barrier instance and use
 * the monitor's wait/notify. The monitor release/acquire pair establishes
 * a happens-before edge, so any state written by an arriving thread is
 * visible to the others once they all arrive.
 */
public final class Barrier {

    private final int parties;
    private int arrived;

    public Barrier(final int parties) {
        if (parties < 1) throw new IllegalArgumentException("parties must be >= 1");
        this.parties = parties;
    }

    /** Block until {@code parties} have called {@code arrive()}. */
    public void arrive() throws InterruptedException {
        synchronized (this) {
            arrived++;
            if (arrived >= parties) {
                arrived = 0;
                notifyAll();
                return;
            }
            while (arrived > 0) {
                wait();
            }
        }
    }

    public int parties() {
        return parties;
    }
}
