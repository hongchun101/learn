package com.kafkalearn.l6;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicLong;

/**
 * L6 — 混沌测试:持续从一个 topic 消费数据,同时你 kill / restart broker。
 * 报告观察到的延迟与间隔。
 *
 * <p>要运行真实的混沌演练,打开另一个 shell 执行:</p>
 *
 * <pre>
 *   docker stop kl-kafka-2 ; sleep 15 ; docker start kl-kafka-2
 * </pre>
 *
 * <p>consumer 日志会显示 partition 重新分配的过程。</p>
 */
public final class ChaosTest {

    private static final Logger log = LoggerFactory.getLogger(ChaosTest.class);

    public static void main(String[] args) {
        String topic = "l6.chaos";
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(topic, 6, (short) 3);
        }

        Properties p = new Properties();
        p.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(ConsumerConfig.GROUP_ID_CONFIG, "l6-chaos");
        p.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        p.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        p.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true");

        AtomicLong received = new AtomicLong();
        long t0 = System.currentTimeMillis();
        try (KafkaConsumer<String, String> c = new KafkaConsumer<>(p)) {
            c.subscribe(List.of(topic));
            long deadline = t0 + Long.parseLong(System.getProperty("durationMs", "90000"));
            while (System.currentTimeMillis() < deadline) {
                ConsumerRecords<String, String> rs = c.poll(Duration.ofMillis(500));
                for (ConsumerRecord<String, String> r : rs) {
                    long now = System.currentTimeMillis();
                    if (received.incrementAndGet() % 50 == 0) {
                        log.info("p={} off={} ts={} latency={}ms",
                                r.partition(), r.offset(), r.timestamp(), now - r.timestamp());
                    }
                }
            }
        }
        log.info("done — received {} records in {} ms", received.get(), System.currentTimeMillis() - t0);
    }
}
