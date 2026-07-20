package cp.chapters.ch03_atomic;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class LongAdderDemoTest {

    @Test
    public void benchCounterFinalTotal() throws Exception {
        final LongAdderDemo.BenchCounter c = new LongAdderDemo.BenchCounter();
        final int threads = 8;
        final int iters = 100_000;
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threads);
        final ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            for (int t = 0; t < threads; t++) {
                pool.submit(() -> {
                    try {
                        start.await();
                        for (int i = 0; i < iters; i++) c.hit();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                    return null;
                });
            }
            start.countDown();
            done.await(10, TimeUnit.SECONDS);
            assertThat(c.total(), equalTo((long) threads * iters));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }
}
