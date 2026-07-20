package cp.chapters.ch04_executors;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.util.concurrent.Callable;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class ThreadPoolExecutorDemoTest {

    private ThreadPoolExecutor pool;

    @Before
    public void setup() {
        pool = ThreadPoolExecutorDemo.boundedNamedPool(2, 4, 8);
    }

    @After
    public void teardown() {
        pool.shutdown();
        try {
            pool.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            pool.shutdownNow();
        }
    }

    @Test
    public void fanOutReduceAddsPartials() throws Exception {
        final Callable<Integer> one = () -> 1;
        final Integer total = ThreadPoolExecutorDemo.fanOutReduce(pool, 5, one, (a, b) -> a + b);
        assertThat(total, equalTo(5));
    }

    @Test
    public void rejectsWhenQueueFull() throws Exception {
        // Saturate the queue by submitting slow tasks.
        for (int i = 0; i < 100; i++) {
            try {
                pool.submit(() -> {
                    try {
                        Thread.sleep(50);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    return null;
                });
            } catch (RejectedExecutionException expected) {
                return;
            }
        }
    }

    @Test
    public void futureGetReturnsValue() throws Exception {
        final Future<Integer> f = pool.submit(() -> 7 * 6);
        assertThat(f.get(5, TimeUnit.SECONDS), equalTo(42));
    }
}
