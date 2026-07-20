package cp.chapters.ch04_executors;

import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * {@link ScheduledExecutorService} — periodic and delayed work.
 *
 * <p>Two semantics are useful:
 * <ul>
 *   <li>{@code schedule} — one-shot, no overlap protection.</li>
 *   <li>{@code scheduleAtFixedRate} — one tick every {@code period},
 *       independent of how long the task ran. If the task overruns the
 *       period, ticks can stack.</li>
 *   <li>{@code scheduleWithFixedDelay} — gap between end and next start.</li>
 * </ul>
 *
 * <p>Happens-before: {@code cancel} happens-before {@code isDone}; a
 * completed task synchronizes-with subsequent reads of its result via
 * {@link ScheduledFuture#get}.
 */
public final class ScheduledExecutorDemo {

    /** Heartbeat that ticks {@code ticks} times then cancels itself. */
    public static long tickHeartbeat(final int ticks, final long periodMs) throws Exception {
        final ScheduledExecutorService s = Executors.newSingleThreadScheduledExecutor();
        try {
            final AtomicLong count = new AtomicLong();
            final ScheduledFuture<?> f = s.scheduleAtFixedRate(new Runnable() {
                @Override
                public void run() {
                    count.incrementAndGet();
                }
            }, 0L, periodMs, TimeUnit.MILLISECONDS);
            while (count.get() < ticks) {
                Thread.sleep(periodMs / 4);
            }
            f.cancel(false);
            return count.get();
        } finally {
            s.shutdown();
            s.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    /** Run a {@link Callable} with a total deadline; cancel if it overruns. */
    public static <T> T withDeadline(final Callable<T> task, final long deadlineMs) throws Exception {
        final ScheduledExecutorService s = Executors.newSingleThreadScheduledExecutor();
        try {
            final ScheduledFuture<T> f = s.schedule(task, 0L, TimeUnit.MILLISECONDS);
            return f.get(deadlineMs, TimeUnit.MILLISECONDS);
        } finally {
            s.shutdown();
            s.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    private ScheduledExecutorDemo() {
    }
}
