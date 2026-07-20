package cp.chapters.ch08_locks_advanced;

import java.util.concurrent.locks.StampedLock;

/**
 * {@link StampedLock} — Java 8's three-mode lock: write, read, optimistic.
 *
 * <p>The optimistic read mode is a CAS-light trick: {@code tryOptimisticRead}
 * returns a {@code stamp} that says "this is the value of the lock
 * right now"; if subsequent {@code validate(stamp)} returns {@code true},
 * the read is safe without ever entering the lock. If validation fails
 * you can upgrade to a real read lock and re-read.
 *
 * <p>This is a Java 8+ API; we use it heavily because the chapter is
 * labelled "8+" and Optimistic reading is the canonical use case.
 */
public final class StampedLockOptimisticDemo {

    /** Geographic coordinates protected by a {@link StampedLock}; readers go optimistic. */
    public static final class Point {
        private double x;
        private double y;
        private final StampedLock lock = new StampedLock();

        public Point(final double x, final double y) {
            this.x = x;
            this.y = y;
        }

        /** Optimistic read; falls back to a locked read if the stamp is invalidated. */
        public double distanceFromOrigin() {
            long stamp = lock.tryOptimisticRead();
            double x1 = x;
            double y1 = y;
            if (!lock.validate(stamp)) {
                stamp = lock.readLock();
                try {
                    x1 = x;
                    y1 = y;
                } finally {
                    lock.unlockRead(stamp);
                }
            }
            return Math.sqrt(x1 * x1 + y1 * y1);
        }

        /** Move the point; take the write lock. */
        public void move(final double dx, final double dy) {
            final long stamp = lock.writeLock();
            try {
                x += dx;
                y += dy;
            } finally {
                lock.unlockWrite(stamp);
            }
        }
    }

    private StampedLockOptimisticDemo() {
    }
}
