package cp.chapters.ch02_juc;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class CyclicBarrierDemoTest {

    @Test
    public void barrierGenerations() throws Exception {
        final int parties = 4;
        final int waves = 3;
        final CyclicBarrierDemo.TwoPhase barrier = new CyclicBarrierDemo.TwoPhase(parties);
        final ExecutorService pool = Executors.newFixedThreadPool(parties);
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(parties);
        try {
            for (int w = 0; w < parties; w++) {
                pool.submit(() -> {
                    try {
                        start.await();
                        for (int i = 0; i < waves; i++) {
                            barrier.arrive();
                        }
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
            assertThat(barrier.generations(), equalTo(waves));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }
}
