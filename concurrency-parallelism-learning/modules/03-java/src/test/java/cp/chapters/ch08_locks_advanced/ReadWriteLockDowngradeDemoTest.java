package cp.chapters.ch08_locks_advanced;

import org.junit.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class ReadWriteLockDowngradeDemoTest {

    @Test
    public void putAndKeepReadReturnsUpdatedValue() {
        final ReadWriteLockDowngradeDemo.DowngradeMap<Integer, String> m =
                new ReadWriteLockDowngradeDemo.DowngradeMap<Integer, String>();
        final String seen = m.putAndKeepRead(1, "v1");
        assertThat(seen, equalTo("v1"));
        assertThat(m.get(1), equalTo("v1"));
    }
}
