package cp.chapters.ch01_threads;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class WaitNotifyDemoTest {

    @Test
    public void putTakeRoundTrips() throws Exception {
        final WaitNotifyDemo.OneSlot<Integer> q = new WaitNotifyDemo.OneSlot<Integer>();
        final ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            final List<Future<?>> tasks = new ArrayList<Future<?>>();
            for (int i = 0; i < 5; i++) {
                final int v = i;
                tasks.add(pool.submit(() -> {
                    q.put(v);
                    return null;
                }));
            }
            final List<Integer> seen = new ArrayList<Integer>();
            for (int i = 0; i < 5; i++) {
                seen.add(q.take());
            }
            for (Future<?> f : tasks) f.get(5, TimeUnit.SECONDS);
            assertThat(seen.size(), equalTo(5));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    @Test
    public void takeBlocksUntilPut() throws Exception {
        final WaitNotifyDemo.OneSlot<Integer> q = new WaitNotifyDemo.OneSlot<Integer>();
        final ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            final Future<Integer> f = pool.submit(q::take);
            // Make sure consumer is parked.
            Thread.sleep(50);
            assertThat(!f.isDone(), equalTo(true));
            final CountDownLatch done = new CountDownLatch(1);
            new Thread(() -> {
                try {
                    q.put(42);
                    done.countDown();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }).start();
            done.await(5, TimeUnit.SECONDS);
            assertThat(f.get(5, TimeUnit.SECONDS), equalTo(42));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }
}
