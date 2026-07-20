package cp.chapters.ch01_threads;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.lessThan;

public class ThreadBasicsTest {

    /** The synchronized counter must always reach its theoretical final value. */
    @Test
    public void raceAndWinIsAlwaysExact() throws Exception {
        final int iters = 50_000;
        final int threads = 8;
        final int got = ThreadBasics.raceAndWin(iters, threads);
        assertThat(got, equalTo(iters * threads));
    }

    /** The unsynchronized counter typically falls short under contention. */
    @Test
    public void raceAndLoseUnderContention() throws Exception {
        final int iters = 50_000;
        final int threads = 8;
        final int got = ThreadBasics.raceAndLose(iters, threads);
        assertThat(got, lessThan(iters * threads));
    }
}
