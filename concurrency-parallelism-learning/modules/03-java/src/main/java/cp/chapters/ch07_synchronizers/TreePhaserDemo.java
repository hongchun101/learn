package cp.chapters.ch07_synchronizers;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Phaser;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Tree barriers built with {@link Phaser}.
 *
 * <p>A {@code Phaser}'s tree-of-phasers idiom gives a logarithmic
 * rendezvous: leaf phasers coalesce small groups, internal phasers
 * coalesce them in turn, until one root phaser produces a single trip.
 * This is the same shape as a tournament reduction; each round has
 * cost proportional to the depth of the tree.
 */
public final class TreePhaserDemo {

    /**
     * Build a binary tree of phasers. {@code totalParties} workers register
     * with the leaves; the root phaser produces the single trip everyone
     * shares.
     */
    public static final class TreeBarrier {
        private final Phaser root;
        private final List<Phaser> layers;

        public TreeBarrier(final int totalParties) {
            // one root phaser with parties == 1 (the root), and we register
            // all workers on the root. For a true tree we would split into
            // leaves of fixed fan-out; we keep this readable by collapsing.
            this.root = new Phaser(totalParties);
            this.layers = new ArrayList<Phaser>();
            this.layers.add(root);
        }

        public void arrive() {
            root.arriveAndAwaitAdvance();
        }

        public int parties() {
            return root.getRegisteredParties();
        }
    }

    /**
     * Run {@code parties} threads through {@code waves} barrier rounds;
     * returns the number of completed barrier trips.
     */
    public static int runWaves(final int parties, final int waves) throws InterruptedException {
        final TreeBarrier barrier = new TreeBarrier(parties);
        final AtomicInteger generations = new AtomicInteger();
        final Phaser counter = new Phaser(parties) {
            @Override
            protected boolean onAdvance(final int phase, final int registeredParties) {
                generations.incrementAndGet();
                return phase >= waves - 1 || registeredParties == 0;
            }
        };
        final List<Thread> ts = new ArrayList<Thread>();
        for (int w = 0; w < parties; w++) {
            ts.add(new Thread(() -> {
                for (int i = 0; i < waves; i++) {
                    barrier.arrive();
                    counter.arriveAndAwaitAdvance();
                }
            }, "tree-" + w));
        }
        for (Thread t : ts) t.start();
        for (Thread t : ts) t.join();
        return generations.get();
    }

    private TreePhaserDemo() {
    }
}
