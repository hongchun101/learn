package cp.chapters.ch03_atomic;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;

public class AtomicFieldUpdaterDemoTest {

    @Test
    public void vitalsCounterUnderContention() throws Exception {
        final AtomicFieldUpdaterDemo.Vitals v = new AtomicFieldUpdaterDemo.Vitals();
        final int threads = 8;
        final int iters = 50_000;
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threads);
        final ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            for (int t = 0; t < threads; t++) {
                pool.submit(() -> {
                    try {
                        start.await();
                        for (int i = 0; i < iters; i++) v.inc();
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
            assertThat(v.count(), equalTo((long) threads * iters));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    @Test
    public void boxObjectCas() {
        final AtomicFieldUpdaterDemo.ObjectBox b = new AtomicFieldUpdaterDemo.ObjectBox("initial");
        assertThat(b.<String>get(), is("initial"));
        assertThat(b.compareAndSet("initial", "next"), equalTo(true));
        assertThat(b.<String>get(), is("next"));
        assertThat(b.compareAndSet("initial", "other"), equalTo(false));
    }
}
