package cp.chapters.ch04_executors;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class ForkJoinDemoTest {

    @Test
    public void sumOfSquaresCommon() {
        // 1^2 + 2^2 + ... + 10^2 = 385
        assertThat(ForkJoinDemo.sumSquaresCommon(11L), equalTo(385L));
    }

    @Test
    public void sumOfSquaresOnCustomPool() {
        // 0^2 + ... + 99^2 = 328350
        assertThat(ForkJoinDemo.sumSquaresOn(4, 100L), equalTo(328350L));
    }
}
