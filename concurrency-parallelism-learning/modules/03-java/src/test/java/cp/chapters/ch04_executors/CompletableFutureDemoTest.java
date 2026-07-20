package cp.chapters.ch04_executors;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class CompletableFutureDemoTest {

    private ExecutorService pool;

    @Before
    public void setup() {
        pool = CompletableFutureDemo.daemonPool(4);
    }

    @After
    public void teardown() {
        CompletableFutureDemo.quietShutdown(pool);
    }

    @Test
    public void squareAsyncComputes() throws Exception {
        assertThat(CompletableFutureDemo.squareAsync(7L).get(), equalTo(49L));
    }

    @Test
    public void multiplySquaresWorks() throws Exception {
        // 3 * 4 -> 9 * 16 = 144
        assertThat(CompletableFutureDemo.multiplySquares(3, 4).get(), equalTo(144L));
    }

    @Test
    public void parallelSumOfSquaresWorks() throws Exception {
        final java.util.List<Integer> xs = new java.util.ArrayList<Integer>();
        xs.add(1); xs.add(2); xs.add(3); xs.add(4); xs.add(5);
        assertThat(CompletableFutureDemo.parallelSumOfSquares(xs).get(), equalTo(55L));
    }

    @Test
    public void parallelSumOfSquaresOnCustomPool() throws Exception {
        final java.util.List<Integer> xs = new java.util.ArrayList<Integer>();
        xs.add(1); xs.add(2); xs.add(3);
        assertThat(CompletableFutureDemo.parallelSumOfSquaresOn(xs, pool).get(), equalTo(14L));
    }

    @Test
    public void withTimeoutReturnsBeforeDeadline() throws Exception {
        final Long got = CompletableFutureDemo.withTimeout(
                CompletableFutureDemo.squareAsync(11L), 1_000);
        assertThat(got, equalTo(121L));
    }

    @Test
    public void withTimeoutThrowsOnDeadlineExceeded() throws Exception {
        final CompletableFuture<Long> slow = CompletableFuture.supplyAsync(() -> {
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return 99L;
        });
        try {
            CompletableFutureDemo.withTimeout(slow, 50L);
            org.junit.Assert.fail("expected timeout");
        } catch (TimeoutException expected) {
            // ok
        }
    }
}
