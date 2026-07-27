package com.kafkalearn.l1;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HelloProducerTest {

    @Test
    void producerPropsExposeClusterBootstrap() {
        var p = HelloProducer.producerProps();
        assertThat(p.getProperty("bootstrap.servers")).isNotBlank();
        assertThat(p.get(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG))
                .isEqualTo(StringSerializer.class);
        assertThat(p.get(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG))
                .isEqualTo(StringSerializer.class);
    }
}
