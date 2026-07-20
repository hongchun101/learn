package cp.chapters.ch02_juc;

import org.junit.Test;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class BlockingQueuesDemoTest {

    @Test
    public void roundTripWithPool() throws Exception {
        for (final BlockingQueue<Integer> q : new BlockingQueue[]{
                BlockingQueuesDemo.boundedFifo(8),
                BlockingQueuesDemo.linkedFifo(8),
                BlockingQueuesDemo.linkedDeque(8),
                BlockingQueuesDemo.synchronous(),
        }) {
            final int N = 50;
            final int producers = 4;
            final int consumers = 2;
            final int perConsumer = N * producers / consumers;
            final CountDownLatch start = new CountDownLatch(1);
            final CountDownLatch done = new CountDownLatch(producers + consumers);
            final AtomicInteger consumed = new AtomicInteger();
            final ExecutorService pool = Executors.newFixedThreadPool(producers + consumers);
            try {
                for (int pid = 0; pid < producers; pid++) {
                    final int id = pid;
                    pool.submit(() -> {
                        try {
                            start.await();
                            for (int i = 0; i < N; i++) q.put(id * N + i);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        } finally {
                            done.countDown();
                        }
                        return null;
                    });
                }
                for (int cid = 0; cid < consumers; cid++) {
                    pool.submit(() -> {
                        try {
                            start.await();
                            for (int i = 0; i < perConsumer; i++) {
                                final Integer v = q.poll(2, TimeUnit.SECONDS);
                                if (v != null) consumed.incrementAndGet();
                            }
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
                assertThat(consumed.get(), equalTo(producers * N));
            } finally {
                pool.shutdown();
                pool.awaitTermination(5, TimeUnit.SECONDS);
            }
        }
    }

    @Test
    public void drainWithTimeoutReturnsAvailable() {
        final BlockingQueue<Integer> q = BlockingQueuesDemo.priority();
        for (int i = 0; i < 10; i++) q.offer(i);
        try {
            assertThat(BlockingQueuesDemo.drainWithTimeout(q, 100, 500),
                    equalTo(10));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
