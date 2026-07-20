package cp.chapters.ch02_juc;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class ExchangerDemoTest {

    @Test
    public void twoSideSwap() throws Exception {
        final ExchangerDemo.PairPipe<String> pipe = new ExchangerDemo.PairPipe<String>();
        final ExecutorService pool = Executors.newFixedThreadPool(2);
        final CountDownLatch start = new CountDownLatch(1);
        final AtomicReference<String> aGot = new AtomicReference<String>();
        final AtomicReference<String> bGot = new AtomicReference<String>();
        final CountDownLatch done = new CountDownLatch(2);
        try {
            pool.submit(() -> {
                try {
                    start.await();
                    aGot.set(pipe.swap("from-A"));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
                return null;
            });
            pool.submit(() -> {
                try {
                    start.await();
                    bGot.set(pipe.swap("from-B"));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
                return null;
            });
            start.countDown();
            done.await(5, TimeUnit.SECONDS);
            assertThat(aGot.get(), equalTo("from-B"));
            assertThat(bGot.get(), equalTo("from-A"));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }
}
