package com.kafkalearn.l7;

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
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * L7 — 端到端 EOS 的 **read-process-write** 模式。
 *
 * <p>consumer 从 {@code l7.input} 读取数据,processor 将每个整数值
 * 乘以 2 后写入 {@code l7.output},全部在同一个 Kafka transaction
 * 内完成。在循环过程中 kill 掉 JVM 再重启:不会出现重复写入、丢失
 * 记录或半提交的事务。</p>
 */
public final class EosEndToEnd {

    private static final Logger log = LoggerFactory.getLogger(EosEndToEnd.class);

    public static void main(String[] args) {
        String in  = "l7.input";
        String out = "l7.output";
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(in, 3, (short) 3);
            admin.createTopic(out, 3, (short) 3);
        }

        // ---------- producer (transactional) ----------
        Properties pp = new Properties();
        pp.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        pp.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        pp.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        pp.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "eos-rpw-" + UUID.randomUUID());
        pp.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        pp.put(ProducerConfig.ACKS_CONFIG, "all");

        // ---------- consumer (read_committed, 手动提交) ----------
        Properties cp = new Properties();
        cp.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        cp.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        cp.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        cp.put(ConsumerConfig.GROUP_ID_CONFIG, "eos-rpw-" + UUID.randomUUID());
        cp.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        cp.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, IsolationLevel.READ_COMMITTED.toString());
        cp.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

        AtomicBoolean done = new AtomicBoolean(false);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> done.set(true)));

        try (Producer<String, String> producer = new KafkaProducer<>(pp);
             KafkaConsumer<String, String> consumer = new KafkaConsumer<>(cp)) {
            producer.initTransactions();
            consumer.subscribe(List.of(in));

            while (!done.get()) {
                ConsumerRecords<String, String> rs = consumer.poll(Duration.ofMillis(500));
                if (rs.isEmpty()) continue;
                producer.beginTransaction();
                try {
                    for (ConsumerRecord<String, String> r : rs) {
                        int v = Integer.parseInt(r.value());
                        producer.send(new ProducerRecord<>(out, r.key(), String.valueOf(v * 2)));
                    }
                    // 在同一个 transaction 内提交 *consumer* 的 offset
                    Map<org.apache.kafka.common.TopicPartition, org.apache.kafka.clients.consumer.OffsetAndMetadata> off = new HashMap<>();
                    rs.partitions().forEach(tp -> {
                        long next = rs.records(tp).get(rs.records(tp).size() - 1).offset() + 1;
                        off.put(tp, new org.apache.kafka.clients.consumer.OffsetAndMetadata(next));
                    });
                    producer.sendOffsetsToTransaction(off, consumer.groupMetadata());
                    producer.commitTransaction();
                    log.info("committed batch size={}", rs.count());
                } catch (Exception e) {
                    log.error("abort", e);
                    producer.abortTransaction();
                }
            }
        }
    }
}
