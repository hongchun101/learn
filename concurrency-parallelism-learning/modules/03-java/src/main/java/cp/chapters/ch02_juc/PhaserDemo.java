package cp.chapters.ch02_juc;

import java.util.concurrent.Phaser;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * {@link Phaser} — a striped, resizable, multi-phase barrier. Where a
 * {@link CyclicBarrier} is a single rendezvous point that resets, a
 * {@code Phaser} keeps a count of registered parties and an internal phase
 * number; {@code awaitAdvance()} returns when the phase reaches a given
 * value. Parties can register or deregister at any time.
 *
 * <p>Happens-before: every phase transition is a synchronizes-with edge.
 * Once {@code awaitAdvance(phase)} returns with {@code nextPhase == phase + 1},
 * the actions of all parties that contributed to completing {@code phase}
 * are visible.
 */
public final class PhaserDemo {

    /** A {@code Phaser} where {@code parties} threads collaborate on {@code phases} rounds. */
    public static final class RoundTrip {
        private final int parties;
        private final int phases;
        private final Phaser phaser;
        private final AtomicInteger phasesCompleted = new AtomicInteger();

        public RoundTrip(final int parties, final int phases) {
            this.parties = parties;
            this.phases = phases;
            this.phaser = new Phaser(parties) {
                @Override
                protected boolean onAdvance(final int phase, final int registeredParties) {
                    phasesCompleted.incrementAndGet();
                    return phase >= phases - 1 || registeredParties == 0;
                }
            };
        }

        public void arrive() {
            final int phase = phaser.arrive();
            phaser.awaitAdvance(phase);
        }

        public int parties() {
            return parties;
        }

        public int phases() {
            return phases;
        }

        public int phasesCompleted() {
            return phasesCompleted.get();
        }
    }

    private PhaserDemo() {
    }
}
