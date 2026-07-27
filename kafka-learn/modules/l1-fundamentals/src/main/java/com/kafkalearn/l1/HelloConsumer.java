package com.kafkalearn.l1;

import com.kafkalearn.common.Cluster;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * L1 — 最简 consumer。
 *
 * <p>从开头订阅 {@code l1.greetings}，打印消息，收到 {@code --count} 条（默认 10 条）后退出。</p>
 */
public final class HelloConsumer {

    private static final Logger log = LoggerFactory.getLogger(HelloConsumer.class);

    public static void main(String[] args) {
        String topic = HelloProducer.TOPIC;
        long maxRecords = Long.parseLong(System.getProperty("count", "10"));
        long timeoutMs = Long.parseLong(System.getProperty("timeoutMs", "15000"));
        String group = System.getProperty("group", "l1-hello");

        Properties p = new Properties();
        p.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        p.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        p.put(ConsumerConfig.GROUP_ID_CONFIG, group);
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        p.put(ConsumerConfig.CLIENT_ID_CONFIG, Cluster.clientId("l1-consumer"));
        p.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

        AtomicBoolean done = new AtomicBoolean(false);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> done.set(true)));

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(p)) {
            consumer.subscribe(List.of(topic));
            long received = 0;
            long deadline = System.currentTimeMillis() + timeoutMs;

            while (!done.get() && received < maxRecords) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
                for (ConsumerRecord<String, String> r : records) {
                    log.info("{}:{}@{} key={} value={}", r.topic(), r.partition(), r.offset(), r.key(), r.value());
                    received++;
                }
                if (System.currentTimeMillis() > deadline && received == 0) break;
            }
            consumer.commitSync();
            log.info("done, received={} committed", received);
        }
    }

    /** 测试套件使用的辅助方法：从指定 offset 消费。 */
    public static ConsumerRecords<String, String> pollAt(KafkaConsumer<String, String> c,
                                                         TopicPartition tp,
                                                         long offset,
                                                         Duration timeout) {
        c.assign(List.of(tp));
        c.seek(tp, offset);
        return c.poll(timeout);
    }
}
