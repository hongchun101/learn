package cp.chapters.ch06_patterns;

import org.junit.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class MpmcQueueTest {

    @Test
    public void roundTripsUnderContention() throws Exception {
        final MpmcQueue<Integer> q = new MpmcQueue<Integer>(4);
        final int N = 100;
        final int producers = 3;
        final int consumers = 4;
        final int perConsumer = 75;
        final ExecutorService pool = Executors.newFixedThreadPool(producers + consumers);
        try {
            @SuppressWarnings("unchecked")
            final Future<Integer>[] pf = new Future[producers];
            for (int pid = 0; pid < producers; pid++) {
                final int id = pid;
                pf[pid] = pool.submit(() -> {
                    for (int i = 0; i < N; i++) q.enqueue(id * 1000 + i);
                    return 0;
                });
            }
            final AtomicInteger consumed = new AtomicInteger();
            final AtomicInteger consumedTotal = new AtomicInteger();
            @SuppressWarnings("unchecked")
            final Future<Integer>[] cf = new Future[consumers];
            for (int i = 0; i < consumers; i++) {
                cf[i] = pool.submit(() -> {
                    int local = 0;
                    for (int j = 0; j < perConsumer; j++) {
                        final Integer v = q.dequeue(1000);
                        if (v != null) {
                            consumed.incrementAndGet();
                            local++;
                        }
                    }
                    consumedTotal.addAndGet(local);
                    return local;
                });
            }
            for (Future<Integer> f : pf) f.get();
            for (Future<Integer> f : cf) f.get();
            q.close();
            assertThat(consumed.get(), equalTo(producers * N));
            assertThat(consumedTotal.get(), equalTo(producers * N));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    @Test
    public void closeMakesDrainReturnImmediately() throws Exception {
        final MpmcQueue<String> q = new MpmcQueue<String>(2);
        q.enqueue("a");
        q.enqueue("b");
        q.close();
        assertThat(q.dequeue(0), equalTo((Object) "a"));
        assertThat(q.dequeue(0), equalTo((Object) "b"));
        assertThat(q.dequeue(0), equalTo(null));
    }

    @Test
    public void uniqueEntriesPreserved() throws Exception {
        final MpmcQueue<Integer> q = new MpmcQueue<Integer>(2);
        final ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            pool.submit(() -> {
                for (int i = 0; i < 50; i++) {
                    try { q.enqueue(i); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                }
                return;
            });
            final Set<Integer> seen = new HashSet<Integer>();
            pool.submit(() -> {
                for (int i = 0; i < 50; i++) {
                    try {
                        final Integer v = q.dequeue(1000);
                        if (v != null) seen.add(v);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
                return;
            }).get();
            q.close();
            assertThat(seen.size(), equalTo(50));
        } finally {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }
}
