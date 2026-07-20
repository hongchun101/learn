package cp.chapters.ch06_patterns;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class PipelineTest {

    @Test
    public void appliesEveryStageInOrder() {
        final List<Function<Integer, Integer>> stages = new ArrayList<Function<Integer, Integer>>();
        stages.add(x -> x + 1);
        stages.add(x -> x * 2);
        stages.add(x -> x - 3);
        final List<Integer> out = Pipeline.run(stages, listOf(0, 1, 2, 3));
        assertThat(out, equalTo(listOf(-1, 1, 3, 5)));
    }

    @SafeVarargs
    private static <T> List<T> listOf(final T... xs) {
        final List<T> out = new ArrayList<T>(xs.length);
        for (T x : xs) out.add(x);
        return out;
    }
}
