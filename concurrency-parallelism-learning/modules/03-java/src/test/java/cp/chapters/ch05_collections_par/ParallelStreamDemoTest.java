package cp.chapters.ch05_collections_par;

import org.junit.Test;

import java.util.List;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class ParallelStreamDemoTest {

    @Test
    public void parallelSumEqualsSequential() {
        final List<Integer> xs = ParallelStreamDemo.rangeList(1_000);
        assertThat(ParallelStreamDemo.parallelSum(xs), equalTo(ParallelStreamDemo.sequentialSum(xs)));
    }

    @Test
    public void parallelReduceComputesMax() {
        final List<Integer> xs = ParallelStreamDemo.rangeList(100);
        final Integer max = ParallelStreamDemo.parallelReduce(xs, (a, b) -> a > b ? a : b);
        assertThat(max, equalTo(99));
    }
}
