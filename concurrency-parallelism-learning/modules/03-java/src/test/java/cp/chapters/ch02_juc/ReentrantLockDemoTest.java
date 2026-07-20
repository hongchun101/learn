package cp.chapters.ch02_juc;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.lessThan;

public class ReentrantLockDemoTest {

    @Test
    public void counterUnderContention() throws Exception {
        final ReentrantLockDemo.Counter c = new ReentrantLockDemo.Counter();
        final int threads = 8;
        final int iters = 10_000;
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threads);
        for (int t = 0; t < threads; t++) {
            new Thread(() -> {
                try {
                    start.await();
                    for (int i = 0; i < iters; i++) c.incrementAndGet();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        done.await();
        assertThat(c.get(), equalTo((long) threads * iters));
    }

    @Test
    public void timedAcquireWaitsForHolder() throws Exception {
        final ReentrantLock lock = new ReentrantLock();
        final long holdMs = 50;
        final long timeoutMs = 500;
        final long elapsed = ReentrantLockDemo.timedAcquireDemo(lock, holdMs, timeoutMs);
        assertThat(elapsed, greaterThanOrEqualTo(holdMs / 2));
        assertThat(elapsed, lessThan(timeoutMs));
    }
}
