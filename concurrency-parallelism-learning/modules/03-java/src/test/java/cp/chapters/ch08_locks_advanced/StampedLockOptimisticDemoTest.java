package cp.chapters.ch08_locks_advanced;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.closeTo;

public class StampedLockOptimisticDemoTest {

    @Test
    public void optimisticReadValidates() {
        final StampedLockOptimisticDemo.Point p = new StampedLockOptimisticDemo.Point(3.0, 4.0);
        assertThat(p.distanceFromOrigin(), closeTo(5.0, 1e-9));
    }

    @Test
    public void optimisticReadFallsBackOnConcurrentWrite() throws Exception {
        final StampedLockOptimisticDemo.Point p = new StampedLockOptimisticDemo.Point(0.0, 0.0);
        final int readers = 4;
        final ExecutorService pool = Executors.newFixedThreadPool(readers + 1);
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(readers + 1);
        final AtomicReference<Double> max = new AtomicReference<Double>(0.0);
        try {
            for (int i = 0; i < readers; i++) {
                pool.submit(() -> {
                    try {
                        start.await();
                        for (int j = 0; j < 1000; j++) {
                            final double d = p.distanceFromOrigin();
                            synchronized (max) {
                                if (d > max.get()) max.set(d);
                            }
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                    return null;
                });
            }
            final Future<?> w = pool.submit(() -> {
                try {
                    start.await();
                    for (int j = 0; j < 1000; j++) p.move(0.01, 0.0);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
                return null;
            });
            start.countDown();
            done.await(10, TimeUnit.SECONDS);
            w.get();
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
        // final point is at (10, 0) — distance must be exactly 10.
        assertThat(p.distanceFromOrigin(), closeTo(10.0, 1e-9));
    }
}
