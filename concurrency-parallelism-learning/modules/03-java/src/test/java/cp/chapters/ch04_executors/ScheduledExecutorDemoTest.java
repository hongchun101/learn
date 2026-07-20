package cp.chapters.ch04_executors;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;

public class ScheduledExecutorDemoTest {

    @Test
    public void heartbeatProducesRequestedCount() throws Exception {
        final long observed = ScheduledExecutorDemo.tickHeartbeat(3, 30);
        assertThat(observed, greaterThanOrEqualTo(3L));
    }

    @Test
    public void withDeadlineReturnsWhenQuick() throws Exception {
        final Integer got = ScheduledExecutorDemo.withDeadline(() -> 42, 1_000);
        assertThat(got, equalTo(42));
    }

    @Test
    public void withDeadlinePropagatesException() {
        try {
            ScheduledExecutorDemo.withDeadline(() -> {
                throw new IllegalStateException("from-task");
            }, 1_000);
            org.junit.Assert.fail("expected exception");
        } catch (Exception e) {
            // ok
        }
    }
}
