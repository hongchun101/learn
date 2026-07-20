package cp.chapters.ch08_locks_advanced;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class CountDownLatchPlusTest {

    @Test
    public void countDownAndAwait() throws Exception {
        final CountDownLatchPlus latch = new CountDownLatchPlus(2);
        final CountDownLatch start = new CountDownLatch(1);
        final AtomicInteger passed = new AtomicInteger();
        final Thread t1 = new Thread(() -> {
            try {
                start.await();
                latch.await();
                passed.incrementAndGet();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        final Thread t2 = new Thread(() -> {
            try {
                start.await();
                latch.await();
                passed.incrementAndGet();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        t1.start();
        t2.start();
        start.countDown();
        Thread.sleep(20);
        latch.countDown();
        latch.countDown();
        t1.join();
        t2.join();
        assertThat(passed.get(), equalTo(2));
    }

    @Test
    public void resetRestoresCount() throws Exception {
        final CountDownLatchPlus latch = new CountDownLatchPlus(1);
        latch.countDown();
        // latch is now 0; reset to 3 and check.
        latch.reset(3);
        assertThat(latch.getCount(), equalTo(3));
    }

    @Test
    public void awaitsTimesOut() throws Exception {
        final CountDownLatchPlus latch = new CountDownLatchPlus(1);
        final boolean got = latch.await(50);
        assertThat(!got, equalTo(true));
    }
}
