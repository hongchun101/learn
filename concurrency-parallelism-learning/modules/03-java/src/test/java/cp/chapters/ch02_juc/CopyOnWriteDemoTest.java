package cp.chapters.ch02_juc;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;

public class CopyOnWriteDemoTest {

    @Test
    public void listenersFireForAllSubscribers() throws Exception {
        final CopyOnWriteDemo.Listeners ls = new CopyOnWriteDemo.Listeners();
        final int listeners = 8;
        final int fires = 32;
        final AtomicInteger fired = new AtomicInteger();
        for (int i = 0; i < listeners; i++) {
            ls.add(fired::incrementAndGet);
        }
        final ExecutorService pool = Executors.newFixedThreadPool(4);
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(4);
        try {
            for (int f = 0; f < 4; f++) {
                pool.submit(() -> {
                    try {
                        start.await();
                        for (int i = 0; i < fires / 4; i++) ls.fire();
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
            assertThat(fired.get(), equalTo(listeners * fires));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    /**
     * Add a listener concurrently with {@code fire()}; the total number of
     * firings observed across all listeners should be at least 1000 plus the
     * extra hits taken after each new listener was added.
     */
    @Test
    public void addAndFireConcurrent() throws Exception {
        final CopyOnWriteDemo.Listeners ls = new CopyOnWriteDemo.Listeners();
        final AtomicInteger count = new AtomicInteger();
        ls.add(count::incrementAndGet);
        final ExecutorService pool = Executors.newFixedThreadPool(2);
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(2);
        try {
            pool.submit(() -> {
                try {
                    start.await();
                    for (int i = 0; i < 1000; i++) ls.fire();
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
                    final Runnable r = count::incrementAndGet;
                    for (int i = 0; i < 5; i++) ls.add(r);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
                return null;
            });
            start.countDown();
            done.await(10, TimeUnit.SECONDS);
            // fired.get() >= 1000 (one listener always present) plus partial contributions
            // from extra listeners added during firing.
            assertThat(count.get(), greaterThanOrEqualTo(1000));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }
}
