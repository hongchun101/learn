package cp.chapters.ch01_threads;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.sameInstance;

public class ThreadLocalDemoTest {

    @Test
    public void perThreadCounterIsIndependent() throws Exception {
        final ThreadLocalDemo.PerThreadCounter c = new ThreadLocalDemo.PerThreadCounter();
        final int threads = 4;
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threads);
        final AtomicInteger maxSeen = new AtomicInteger();
        for (int t = 0; t < threads; t++) {
            new Thread(() -> {
                try {
                    start.await();
                    int localMax = 0;
                    for (int i = 0; i < 100; i++) {
                        final int v = c.next();
                        if (v > localMax) localMax = v;
                    }
                    synchronized (maxSeen) {
                        if (maxSeen.get() < localMax) maxSeen.set(localMax);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            }, "tl-" + Thread.currentThread().getId()).start();
        }
        start.countDown();
        done.await();
        assertThat(maxSeen.get(), equalTo(100));
    }

    @Test
    public void inheritableProvidesChildValue() throws Exception {
        final ThreadLocalDemo.InheritableBox<String> box = new ThreadLocalDemo.InheritableBox<String>(() -> "parent");
        box.set("hello");
        final StringBuilder seen = new StringBuilder();
        final Thread child = new Thread(() -> seen.append(box.get()));
        child.start();
        child.join();
        assertThat(seen.toString(), equalTo("hello"));
    }

    @Test
    public void parentChangeAfterStartNotVisible() throws Exception {
        final ThreadLocalDemo.InheritableBox<String> box = new ThreadLocalDemo.InheritableBox<String>(() -> "init");
        final StringBuilder seen = new StringBuilder();
        final Thread child = new Thread(() -> seen.append(box.get()));
        child.start();
        box.set("changed"); // after start, this should not propagate
        child.join();
        assertThat(seen.toString(), not(sameInstance("changed")));
    }
}
