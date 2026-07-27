package com.kafkalearn.l1;

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
import java.util.concurrent.Future;

/**
 * L1 — 最简 producer。
 *
 * <p>目标：向 {@code l1.greetings} 发送 10 条消息，并打印生成的 {@link RecordMetadata}（topic、partition、offset）。</p>
 *
 * <p>运行：{@code java -cp target/classes:target/dependency/* com.kafkalearn.l1.HelloProducer}</p>
 */
public final class HelloProducer {

    private static final Logger log = LoggerFactory.getLogger(HelloProducer.class);
    public static final String TOPIC = "l1.greetings";

    public static void main(String[] args) throws Exception {
        int n = args.length > 0 ? Integer.parseInt(args[0]) : 10;
        try (KafkaAdmin admin = new KafkaAdmin();
             Producer<String, String> producer = new KafkaProducer<>(producerProps())) {

            admin.createTopic(TOPIC, 3, (short) 1);
            log.info("Sending {} records to {}", n, TOPIC);

            for (int i = 0; i < n; i++) {
                ProducerRecord<String, String> r =
                        new ProducerRecord<>(TOPIC, "k" + (i % 4), "hello-" + i);
                Future<RecordMetadata> f = producer.send(r);
                RecordMetadata md = f.get();
                log.info("sent key={} → {}-{}@{}", r.key(), md.topic(), md.partition(), md.offset());
            }

            producer.flush();
        }
        log.info("done");
    }

    /** 公开此方法，以便本模块的其他实验复用相同配置。 */
    public static Properties producerProps() {
        Properties p = new Properties();
        p.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.CLIENT_ID_CONFIG, Cluster.clientId("l1-producer"));
        // L1 有意使用默认配置（acks=all，幂等性关闭）。
        // L3 将启用这些配置并解释差异。
        return p;
    }
}
