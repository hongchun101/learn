package cp.chapters.ch05_collections_par;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class CustomForkJoinDemoTest {

    @Test
    public void sumsLinearWork() {
        // sum_{i=0..N-1} 2*i = N(N-1)
        final int N = 100;
        final long got = CustomForkJoinDemo.runOnCommon(0, N, i -> 2L * i);
        assertThat(got, equalTo((long) N * (N - 1)));
    }

    @Test
    public void sumsSquares() {
        // 0^2+1^2+...+99^2 = 328350
        final long got = CustomForkJoinDemo.runOnCommon(0, 100, i -> (long) i * i);
        assertThat(got, equalTo(328350L));
    }
}
