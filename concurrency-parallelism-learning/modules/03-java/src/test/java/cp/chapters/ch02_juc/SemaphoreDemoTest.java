package cp.chapters.ch02_juc;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

public class SemaphoreDemoTest {

    @Test
    public void peakConcurrencyBoundedByPermits() throws Exception {
        final int permits = 3;
        final int threads = 12;
        final SemaphoreDemo.MaxConcurrency gate = new SemaphoreDemo.MaxConcurrency(permits);
        final ExecutorService pool = Executors.newFixedThreadPool(threads);
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threads);
        try {
            for (int i = 0; i < threads; i++) {
                pool.submit((Runnable) () -> {
                    try {
                        start.await();
                        gate.runInProtectedSection();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                    return;
                });
            }
            start.countDown();
            done.await(5, TimeUnit.SECONDS);
            assertThat("peak <= permits", gate.peakConcurrency(), lessThanOrEqualTo(permits));
            assertThat("peak observed concurrency", gate.peakConcurrency(), greaterThanOrEqualTo(2));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }
}
