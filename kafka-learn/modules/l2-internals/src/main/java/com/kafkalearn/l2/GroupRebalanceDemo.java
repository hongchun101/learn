package com.kafkalearn.l2;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import com.kafkalearn.common.Waits;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRebalanceListener;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * L2 —— 观察 consumer group 的 rebalance 过程。
 *
 * <p>订阅时附带一个自定义的 {@link ConsumerRebalanceListener}，
 * 用于打印 assigned / revoked / lost 的 partition。用相同的 group id
 * 同时运行两个实例，可以观察 partition 在它们之间来回迁移。</p>
 */
public final class GroupRebalanceDemo {

    private static final Logger log = LoggerFactory.getLogger(GroupRebalanceDemo.class);

    public static void main(String[] args) {
        String topic = "l2.rebalance-" + UUID.randomUUID().toString().substring(0, 8);
        String group = "l2-rebalance-" + UUID.randomUUID().toString().substring(0, 8);

        // 创建一个 6-partition 的 topic，以便观察 partition 的迁移。
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(topic, 6, (short) 3);
        }

        Properties p = new Properties();
        p.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        p.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        p.put(ConsumerConfig.GROUP_ID_CONFIG, group);
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        p.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");
        p.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 10_000);
        p.put(ConsumerConfig.PARTITION_ASSIGNMENT_STRATEGY_CONFIG,
                "org.apache.kafka.clients.consumer.CooperativeStickyAssignor");

        AtomicBoolean done = new AtomicBoolean(false);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> done.set(true)));

        try (KafkaConsumer<String, String> c = new KafkaConsumer<>(p)) {
            c.subscribe(List.of(topic), new ConsumerRebalanceListener() {
                @Override
                public void onPartitionsRevoked(Collection<TopicPartition> revoked) {
                    log.info("REVOKED {}", revoked);
                }
                @Override
                public void onPartitionsAssigned(Collection<TopicPartition> assigned) {
                    log.info("ASSIGNED {}", assigned);
                }
                @Override
                public void onPartitionsLost(Collection<TopicPartition> lost) {
                    log.info("LOST {}", lost);
                }
            });

            long end = System.currentTimeMillis() + Long.parseLong(System.getProperty("durationMs", "60000"));
            while (!done.get() && System.currentTimeMillis() < end) {
                ConsumerRecords<String, String> rs = c.poll(Duration.ofMillis(500));
                int n = 0;
                for (ConsumerRecord<String, String> r : rs) {
                    if (n++ < 3) log.info("got {}-{}@{}={}", r.topic(), r.partition(), r.offset(), r.value());
                }
                Waits.sleep(200);
            }
        }
    }
}
