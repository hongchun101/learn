package cp.chapters.ch06_patterns;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class BarrierTest {

    @Test
    public void blocksUntilAllArrived() throws Exception {
        final int parties = 4;
        final Barrier barrier = new Barrier(parties);
        final AtomicInteger released = new AtomicInteger();
        final ExecutorService pool = Executors.newFixedThreadPool(parties);
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(parties);
        try {
            final Future<?>[] fs = new Future<?>[parties];
            for (int i = 0; i < parties; i++) {
                fs[i] = pool.submit(() -> {
                    try {
                        start.await();
                        Thread.sleep(1);
                        barrier.arrive();
                        released.incrementAndGet();
                    } catch (Exception e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                    return null;
                });
            }
            start.countDown();
            done.await(5, TimeUnit.SECONDS);
            for (Future<?> f : fs) f.get();
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
        assertThat(released.get(), equalTo(parties));
    }
}
