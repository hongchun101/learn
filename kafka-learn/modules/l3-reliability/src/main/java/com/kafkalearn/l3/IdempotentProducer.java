package com.kafkalearn.l3;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.Future;

/**
 * L3 —— 幂等 producer。
 *
 * <p>{@code enable.idempotence=true}（3.0 起为默认值）可实现单次发送上的 exactly-once：
 * broker 会根据 producer id 与 sequence number 对重试进行去重，
 * 不会再出现因 leader 切换而引发的“幻影”重复消息。</p>
 *
 * <p>该 lab 使用相同的 key 连续发送 5 条消息，以体现幂等性只在同一 producer 会话内去重。</p>
 */
public final class IdempotentProducer {

    private static final Logger log = LoggerFactory.getLogger(IdempotentProducer.class);

    public static void main(String[] args) throws Exception {
        String topic = "l3.idempotent-" + UUID.randomUUID().toString().substring(0, 8);
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(topic, 3, (short) 3);
        }

        Properties p = AcksDemo.baseProps();
        p.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        p.put(ProducerConfig.ACKS_CONFIG, "all");
        p.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        p.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);

        try (Producer<String, String> producer = new KafkaProducer<>(p)) {
            for (int i = 0; i < 5; i++) {
                Future<?> f = producer.send(new ProducerRecord<>(topic, "k1", "v" + i));
                try { f.get(); } catch (Exception e) { log.warn("send failed", e); }
            }
            producer.flush();
        }
        log.info("done");
    }
}
