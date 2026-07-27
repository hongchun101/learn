package com.kafkalearn.common;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ClusterTest {

    @Test
    void defaultBootstrapContainsThreeBrokers() {
        assertThat(Cluster.DEFAULT_BOOTSTRAP).contains("19092", "29092", "39092");
    }

    @Test
    void bootstrapListSplitsOnComma() {
        assertThat(Cluster.bootstrapList()).hasSize(3);
    }

    @Test
    void clientIdIncludesTag() {
        assertThat(Cluster.clientId("foo")).startsWith("kl-foo-");
    }
}
