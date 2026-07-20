package cp.chapters.ch06_patterns;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class FanOutFanInTest {

    @Test
    public void preservesOrderWithHighParallelism() throws Exception {
        final int n = 100;
        final List<Integer> inputs = new ArrayList<Integer>(n);
        for (int i = 0; i < n; i++) inputs.add(i);
        final Function<Integer, Integer> work = x -> {
            Thread.yield();
            Thread.yield();
            return x * 2;
        };
        final List<Integer> out = FanOutFanIn.run(work, inputs, 16);
        final List<Integer> expected = new ArrayList<Integer>(n);
        for (int i = 0; i < n; i++) expected.add(i * 2);
        assertThat(out, equalTo(expected));
    }

    @Test
    public void handlesEdgesOfParallelism() throws Exception {
        final List<Integer> inputs = listOf(1, 2, 3, 4, 5);
        final Function<Integer, Integer> work = x -> x + 1;
        final List<Integer> expected = listOf(2, 3, 4, 5, 6);
        for (final int p : new int[]{1, 2, 5, 10}) {
            assertThat("p=" + p, FanOutFanIn.run(work, inputs, p), equalTo(expected));
        }
    }

    @SafeVarargs
    private static <T> List<T> listOf(final T... xs) {
        final List<T> out = new ArrayList<T>(xs.length);
        for (T x : xs) out.add(x);
        return out;
    }
}
