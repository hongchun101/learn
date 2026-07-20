package cp.chapters.ch07_synchronizers;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class TreePhaserDemoTest {

    @Test
    public void runWavesReportsCompletedGenerations() throws Exception {
        final int got = TreePhaserDemo.runWaves(8, 4);
        assertThat(got, equalTo(4));
    }
}
