package com.kafkalearn.l3;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.serialization.StringSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.Future;

/**
 * L3 —— 展示三种 {@code acks} 模式在延迟与可靠性之间的取舍。
 *
 * <ul>
 *   <li>{@code acks=0} —— 即发即弃。延迟在毫秒级以下，没有任何可靠性保证。</li>
 *   <li>{@code acks=1} —— 仅等待 leader 写入完成。leader 在写入中途发生故障时会造成数据丢失。</li>
 *   <li>{@code acks=all} —— 等待所有 ISR 写入完成。最安全的模式，
 *       会带来约 10-20 ms 的额外延迟。配合 {@code min.insync.replicas ≥ 2}，
 *       是唯一安全的默认配置。</li>
 * </ul>
 *
 * <p>该 lab 创建一个 3-partition、RF=3 的 topic，并分别用三种设置各发送 1000 条消息进行计时。</p>
 */
public final class AcksDemo {

    private static final Logger log = LoggerFactory.getLogger(AcksDemo.class);

    public static void main(String[] args) throws Exception {
        String topic = "l3.acks-" + UUID.randomUUID().toString().substring(0, 8);
        int n = Integer.parseInt(System.getProperty("count", "1000"));

        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(topic, 3, (short) 3);
        }

        for (String acks : new String[]{"0", "1", "all"}) {
            Properties p = baseProps();
            p.put(ProducerConfig.ACKS_CONFIG, acks);
            // 这里关闭幂等性，以便单独观察 `acks` 本身的影响。
            p.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, false);
            try (Producer<String, String> producer = new KafkaProducer<>(p)) {
                long t0 = System.nanoTime();
                int errors = 0;
                for (int i = 0; i < n; i++) {
                    Future<RecordMetadata> f = producer.send(new ProducerRecord<>(topic, "k" + i, "v" + i));
                    try {
                        f.get();
                    } catch (Exception e) {
                        errors++;
                    }
                }
                long ms = (System.nanoTime() - t0) / 1_000_000;
                log.info("acks={} sent={} errors={} totalMs={} avgMs={}",
                        acks, n, errors, ms, String.format("%.3f", ms / (double) n));
            }
        }
    }

    public static Properties baseProps() {
        Properties p = new Properties();
        p.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.CLIENT_ID_CONFIG, Cluster.clientId("l3-acks"));
        p.put(ProducerConfig.LINGER_MS_CONFIG, 5);
        p.put(ProducerConfig.BATCH_SIZE_CONFIG, 16 * 1024);
        p.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "lz4");
        return p;
    }
}
