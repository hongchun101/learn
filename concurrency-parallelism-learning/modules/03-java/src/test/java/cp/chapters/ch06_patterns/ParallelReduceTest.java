package cp.chapters.ch06_patterns;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BinaryOperator;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class ParallelReduceTest {

    @Test
    public void matchesSequential() throws Exception {
        final int n = 1000;
        final List<Integer> inputs = new ArrayList<Integer>(n);
        for (int i = 0; i < n; i++) inputs.add(i + 1);
        final BinaryOperator<Integer> sum = (a, b) -> a + b;
        int expected = inputs.get(0);
        for (int i = 1; i < inputs.size(); i++) expected = sum.apply(expected, inputs.get(i));
        for (final int p : new int[]{1, 2, 4, 8, 16, 32, 100}) {
            assertThat("p=" + p, ParallelReduce.run(sum, inputs, p), equalTo(expected));
        }
    }
}
