package com.kafkalearn.l7;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AffinityPartitionerTest {

    @Test
    void closeIsNoOp() {
        var p = new AffinityPartitioner();
        // configure() 与 close() 按设计就是空操作。
        p.configure(java.util.Map.of());
        p.close();
        assertThat(true).isTrue();
    }
}
