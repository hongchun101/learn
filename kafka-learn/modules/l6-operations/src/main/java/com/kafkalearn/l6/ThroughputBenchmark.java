package com.kafkalearn.l6;

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
import java.util.concurrent.TimeUnit;

/**
 * L6 — 单 producer 的吞吐 benchmark。
 *
 * <p>报告 records-per-second 与 MB-per-second。可用来在本地
 * docker compose 集群上对集群能力做基准刻画:</p>
 *
 * <pre>
 *   java -Drecords=2000000 -Dpayload=1024 \
 *        com.kafkalearn.l6.ThroughputBenchmark
 * </pre>
 */
public final class ThroughputBenchmark {

    private static final Logger log = LoggerFactory.getLogger(ThroughputBenchmark.class);

    public static void main(String[] args) throws Exception {
        String topic = "l6.bench-" + UUID.randomUUID().toString().substring(0, 8);
        int records = Integer.parseInt(System.getProperty("records", "200000"));
        int payload = Integer.parseInt(System.getProperty("payload", "512"));
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(topic, 6, (short) 3);
        }

        Properties p = new Properties();
        p.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.ACKS_CONFIG, "1");          // benchmark 时仅需 leader 确认
        p.put(ProducerConfig.LINGER_MS_CONFIG, 10);
        p.put(ProducerConfig.BATCH_SIZE_CONFIG, 64 * 1024);
        p.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "lz4");
        p.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 64 * 1024 * 1024);

        byte[] body = new byte[payload];
        long t0 = System.nanoTime();
        try (Producer<String, String> producer = new KafkaProducer<>(p)) {
            for (int i = 0; i < records; i++) {
                producer.send(new ProducerRecord<>(topic, "k" + (i % 16), new String(body)));
            }
        }
        long durNs = System.nanoTime() - t0;
        double sec = durNs / 1e9;
        log.info("records={} payload={}B total={} s rps={} MBps={}",
                records, payload, TimeUnit.NANOSECONDS.toSeconds(durNs),
                String.format("%.0f", records / sec),
                String.format("%.2f", (records * payload) / sec / 1024 / 1024));
    }
}
