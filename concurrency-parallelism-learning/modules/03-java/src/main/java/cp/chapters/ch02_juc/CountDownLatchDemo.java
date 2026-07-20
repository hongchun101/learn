package cp.chapters.ch02_juc;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * {@link CountDownLatch} — one-shot rendezvous. Threads call {@code countDown()}
 * when they finish, threads call {@code await()} to block until the count
 * reaches zero. Useful for "start gun" and "all workers done" patterns.
 *
 * <p>Happens-before: {@code countDown()} performs a release that
 * synchronizes-with all subsequent {@code await()} returns on the same
 * instance. Anything written before {@code countDown()} is published to
 * the awaiting thread after it returns. The latch is single-use.
 */
public final class CountDownLatchDemo {

    /** "Start gun" pattern: N workers wait, coordinator fires the start. */
    public static void startGun(final int workerCount) throws InterruptedException {
        final CountDownLatch fire = new CountDownLatch(1);
        final AtomicInteger counter = new AtomicInteger();
        final CountDownLatch done = new CountDownLatch(workerCount);
        final Thread[] workers = new Thread[workerCount];
        for (int i = 0; i < workerCount; i++) {
            workers[i] = new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        fire.await();
                        counter.incrementAndGet();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                }
            }, "worker-" + Thread.currentThread().getId());
        }
        for (Thread w : workers) w.start();
        Thread.sleep(1); // give workers a chance to park
        fire.countDown();  // start gun
        done.await();
    }

    private CountDownLatchDemo() {
    }
}
