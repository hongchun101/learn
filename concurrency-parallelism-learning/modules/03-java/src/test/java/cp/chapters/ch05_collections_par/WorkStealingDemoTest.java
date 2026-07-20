package cp.chapters.ch05_collections_par;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class WorkStealingDemoTest {

    @Test
    public void producesRequestedTotal() {
        final long total = WorkStealingDemo.runAndReportSteals(10_000, 4);
        assertThat(total, equalTo(10_000L));
    }

    @Test
    public void unevenStealsRunsWithoutError() {
        final long steals = WorkStealingDemo.unevenStealsDemo(4);
        // We don't strictly require steals > 0 because the schedule varies,
        // but the run must complete and report a non-negative steal count.
        assertThat(steals >= 0L, equalTo(true));
    }
}
