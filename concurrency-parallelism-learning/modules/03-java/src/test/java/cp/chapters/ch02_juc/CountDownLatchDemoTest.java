package cp.chapters.ch02_juc;

import org.junit.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class CountDownLatchDemoTest {

    @Test
    public void startGunReleasesAllWorkers() throws Exception {
        final AtomicInteger fired = new AtomicInteger();
        // Run the start-gun on a side thread and verify it completes.
        final Thread demo = new Thread(() -> {
            try {
                CountDownLatchDemo.startGun(8);
                fired.incrementAndGet();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        demo.start();
        demo.join(5_000);
        assertThat(fired.get(), equalTo(1));
    }
}
