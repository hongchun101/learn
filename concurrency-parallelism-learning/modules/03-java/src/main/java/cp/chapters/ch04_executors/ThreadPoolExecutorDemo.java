package cp.chapters.ch04_executors;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BinaryOperator;

/**
 * {@link ThreadPoolExecutor} directly — full control over core size,
 * max size, queue, rejection, and naming.
 *
 * <p>The four handler slots of the constructor are exercised here:
 * named {@link ThreadFactory}, corePoolSize, maxPoolSize, keep-alive,
 * work queue, and rejection handler.
 */
public final class ThreadPoolExecutorDemo {

    /**
     * Build a small bounded pool with a named thread factory and an
     * {@code AbortPolicy} so capacity overruns surface as exceptions
     * rather than silently dropping work.
     */
    public static ThreadPoolExecutor boundedNamedPool(final int core, final int max,
                                                      final int queueSize) {
        final ThreadFactory names = new ThreadFactory() {
            private final AtomicLong ids = new AtomicLong();

            @Override
            public Thread newThread(final Runnable r) {
                final Thread t = new Thread(r, "cp-pool-" + ids.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        };
        final RejectedExecutionHandler reject = new ThreadPoolExecutor.AbortPolicy();
        return new ThreadPoolExecutor(core, max, 60L, TimeUnit.SECONDS,
                new ArrayBlockingQueue<Runnable>(queueSize), names, reject);
    }

    /**
     * Submit {@code parallelism} partials to {@code pool}, each partial is the
     * value of {@code unit.call()} on the worker that ran it. The caller
     * supplies a {@link BinaryOperator#BinaryOperator binary operator} used to
     * merge the partials in submission order.
     */
    public static <T> T fanOutReduce(final ThreadPoolExecutor pool,
                                     final int parallelism,
                                     final Callable<T> unit,
                                     final BinaryOperator<T> combine) throws Exception {
        final List<Future<T>> fs = new ArrayList<Future<T>>();
        for (int t = 0; t < parallelism; t++) {
            fs.add(pool.submit(unit));
        }
        T acc = fs.get(0).get();
        for (int i = 1; i < fs.size(); i++) {
            acc = combine.apply(acc, fs.get(i).get());
        }
        return acc;
    }

    private ThreadPoolExecutorDemo() {
    }
}
