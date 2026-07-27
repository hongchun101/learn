package com.kafkalearn.l3;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.IsolationLevel;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

/**
 * L3 —— 使用事务实现跨 topic 的 exactly-once。
 *
 * <p>经典的“从账户 A 转账到账户 B”演示：同一个 producer
 * 从 {@code debit} topic 消费消息，经过转换后写入 {@code credit} topic，
 * 两边共用同一个事务，因此 consumer 可以使用
 * {@code isolation.level=read_committed}，只会看到两段都完成的转账。</p>
 */
public final class TransactionalTransfer {

    private static final Logger log = LoggerFactory.getLogger(TransactionalTransfer.class);

    public static void main(String[] args) throws Exception {
        String inTopic  = "l3.debit-"  + UUID.randomUUID().toString().substring(0, 8);
        String outTopic = "l3.credit-" + UUID.randomUUID().toString().substring(0, 8);
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(inTopic, 3, (short) 3);
            admin.createTopic(outTopic, 3, (short) 3);
        }

        // ---- producer -----------------------------------------------------
        Properties pp = AcksDemo.baseProps();
        pp.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        pp.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "tx-transfer-" + UUID.randomUUID());
        pp.put(ProducerConfig.ACKS_CONFIG, "all");

        try (Producer<String, String> producer = new KafkaProducer<>(pp)) {
            producer.initTransactions();
            int n = Integer.parseInt(System.getProperty("count", "5"));
            for (int i = 0; i < n; i++) {
                producer.beginTransaction();
                try {
                    String amount = String.valueOf(100 + i);
                    producer.send(new ProducerRecord<>(inTopic, "acct-" + i, amount));
                    // 模拟业务处理
                    producer.send(new ProducerRecord<>(outTopic, "acct-" + i, amount));
                    producer.commitTransaction();
                    log.info("committed transfer {}", i);
                } catch (Exception e) {
                    log.error("abort", e);
                    producer.abortTransaction();
                }
            }
        }

        // ---- consumer (read_committed) ------------------------------------
        Properties cp = new Properties();
        cp.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        cp.put(ConsumerConfig.GROUP_ID_CONFIG, "l3-tx-" + UUID.randomUUID());
        cp.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        cp.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        cp.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        cp.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, IsolationLevel.READ_COMMITTED.toString());
        cp.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(cp)) {
            consumer.subscribe(List.of(inTopic, outTopic));
            Map<String, Integer> seen = new HashMap<>();
            long deadline = System.currentTimeMillis() + 15_000;
            while (System.currentTimeMillis() < deadline) {
                ConsumerRecords<String, String> rs = consumer.poll(Duration.ofMillis(500));
                for (ConsumerRecord<String, String> r : rs) {
                    seen.merge(r.topic(), 1, Integer::sum);
                }
            }
            log.info("seen: {}", seen);
        }
    }
}
