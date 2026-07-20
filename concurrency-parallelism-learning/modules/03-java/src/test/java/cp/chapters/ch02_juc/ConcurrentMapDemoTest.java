package cp.chapters.ch02_juc;

import org.junit.Test;

import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class ConcurrentMapDemoTest {

    @Test
    public void wordCounterUnderContention() throws Exception {
        final ConcurrentMapDemo.WordCounter wc = new ConcurrentMapDemo.WordCounter();
        final int threads = 8;
        final int iters = 1_000;
        // Each thread hits word-{0..6}; each word receives `threads` hits per inner loop.
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threads);
        final ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            for (int t = 0; t < threads; t++) {
                pool.submit(() -> {
                    try {
                        start.await();
                        for (int i = 0; i < iters; i++) wc.increment("word-" + (i % 7));
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
            // Each word received (iters / 7) hits per thread, times `threads`.
            // 1000 / 7 = 142 for the exact-split case; with rounding we sum and check totals.
            long totalCounts = 0;
            for (int i = 0; i < 7; i++) {
                totalCounts += wc.count("word-" + i);
            }
            assertThat(totalCounts, equalTo((long) threads * iters));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    @Test
    public void snapshotHasKnownKeys() {
        final ConcurrentMapDemo.WordCounter wc = new ConcurrentMapDemo.WordCounter();
        wc.increment("a");
        wc.increment("b");
        wc.increment("a");
        final Map<String, Long> snap = wc.snapshot();
        assertThat(snap.get("a"), equalTo(2L));
        assertThat(snap.get("b"), equalTo(1L));
    }
}
