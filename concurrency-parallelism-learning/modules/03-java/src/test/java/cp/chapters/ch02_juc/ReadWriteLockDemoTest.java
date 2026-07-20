package cp.chapters.ch02_juc;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class ReadWriteLockDemoTest {

    /**
     * Confirm that multiple readers can hold the read lock at once. We
     * wrap a {@link ReentrantReadWriteLock} directly and stamp inFlight
     * inside the read critical section.
     */
    @Test
    public void readSharedWriteExclusive() throws Exception {
        final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
        final int readers = 8;
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(readers);
        final AtomicInteger inFlight = new AtomicInteger();
        final AtomicInteger peak = new AtomicInteger();
        for (int i = 0; i < readers; i++) {
            new Thread(() -> {
                try {
                    start.await();
                    for (int k = 0; k < 200; k++) {
                        rw.readLock().lock();
                        try {
                            final int now = inFlight.incrementAndGet();
                            int observed;
                            do {
                                observed = peak.get();
                                if (now <= observed) break;
                            } while (!peak.compareAndSet(observed, now));
                            try { Thread.sleep(1); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                            inFlight.decrementAndGet();
                        } finally {
                            rw.readLock().unlock();
                        }
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        done.await(10, TimeUnit.SECONDS);
        final int observed = peak.get();
        assertThat("observed peak at most readers", observed <= readers, equalTo(true));
        assertThat("observed peak >= 2 readers concurrent", observed >= 2, equalTo(true));
    }

    /**
     * Confirm that the write lock is exclusive. We sample inFlight inside
     * a write-lock-protected section; if more than one writer enters at
     * once the lock has failed to exclude writes.
     */
    @Test
    public void writesAreExclusive() throws Exception {
        final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
        final int writers = 4;
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(writers);
        final AtomicInteger inFlight = new AtomicInteger();
        final AtomicInteger peak = new AtomicInteger();
        for (int i = 0; i < writers; i++) {
            new Thread(() -> {
                try {
                    start.await();
                    for (int k = 0; k < 200; k++) {
                        rw.writeLock().lock();
                        try {
                            final int now = inFlight.incrementAndGet();
                            int observed;
                            do {
                                observed = peak.get();
                                if (now <= observed) break;
                            } while (!peak.compareAndSet(observed, now));
                            inFlight.decrementAndGet();
                        } finally {
                            rw.writeLock().unlock();
                        }
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        done.await(10, TimeUnit.SECONDS);
        assertThat("peak of concurrent writers", peak.get(), equalTo(1));
    }
}
