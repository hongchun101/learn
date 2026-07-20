package cp.chapters.ch04_executors;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class ExecutorServiceDemoTest {

    @Test
    public void sumOfSquaresExact() throws Exception {
        // 0^2 + 1^2 + 2^2 + ... + 9^2 = 285
        long got = ExecutorServiceDemo.sumOfSquares(10, 4);
        assertThat(got, equalTo(285L));
    }

    @Test
    public void parallelismOneWorks() throws Exception {
        long got = ExecutorServiceDemo.sumOfSquares(5, 1);
        assertThat(got, equalTo(0L + 1L + 4L + 9L + 16L));
    }
}
