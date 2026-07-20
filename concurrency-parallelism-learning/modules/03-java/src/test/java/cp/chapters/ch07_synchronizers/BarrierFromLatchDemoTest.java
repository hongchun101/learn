package cp.chapters.ch07_synchronizers;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class BarrierFromLatchDemoTest {

    @Test
    public void runWavesProducesExpectedTotal() throws Exception {
        // 3 waves over 4 workers; per-wave value 0+1+2 = 3
        final int total = BarrierFromLatchDemo.runWaves(4, 3);
        assertThat(total, equalTo(0 + 1 + 2));
    }
}
