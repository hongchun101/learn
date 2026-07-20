package cp.chapters.ch06_patterns;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

public class RateLimiterTest {

    @Test
    public void producesAtMostRateTimesSeconds() {
        final int produced = RateLimiter.run(100, 200);
        // 100 per sec, 0.2s window -> roughly 20, allow [15, 25] for sleep/park granularity
        assertThat(produced, greaterThanOrEqualTo(15));
        assertThat(produced, lessThanOrEqualTo(25));
    }

    @Test
    public void zeroDurationProducesZero() {
        final int produced = RateLimiter.run(100, 0);
        assertThat(produced, equalTo(0));
    }
}
