package com.kafkalearn.l3;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

/**
 * L3 —— 采用“先处理再提交”模式实现 at-least-once。
 *
 * <p>只有当消息的副作用（这里指 {@code System.out.println}）完成之后，
 * 才提交对应消息的 offset。这是大多数生产环境 consumer 使用的典型模式。</p>
 *
 * <p>若要实现端到端的 exactly-once，可以将 consumer 与一个事务型 producer 配对使用，
 * 即 L7 中介绍的 {@code read-process-write} 模式。</p>
 */
public final class ProcessAndCommit {

    private static final Logger log = LoggerFactory.getLogger(ProcessAndCommit.class);

    public static void main(String[] args) {
        String topic = "l1.greetings";
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(topic, 3, (short) 1);
        }

        Properties p = new Properties();
        p.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        p.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        p.put(ConsumerConfig.GROUP_ID_CONFIG, "l3-process-commit-" + UUID.randomUUID());
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        p.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

        try (KafkaConsumer<String, String> c = new KafkaConsumer<>(p)) {
            c.subscribe(List.of(topic));
            long deadline = System.currentTimeMillis() + 10_000;
            while (System.currentTimeMillis() < deadline) {
                ConsumerRecords<String, String> rs = c.poll(Duration.ofMillis(500));
                if (rs.isEmpty()) continue;
                Map<TopicPartition, OffsetAndMetadata> toCommit = new HashMap<>();
                for (ConsumerRecord<String, String> r : rs) {
                    // 1) 处理消息
                    log.info("processing {}-{}@{}={}", r.topic(), r.partition(), r.offset(), r.value());
                    // 2) 记录下一个待提交的 offset
                    toCommit.put(new TopicPartition(r.topic(), r.partition()),
                            new OffsetAndMetadata(r.offset() + 1));
                }
                // 3) 在处理完成 *之后* 再提交
                c.commitSync(toCommit);
            }
        }
    }
}
