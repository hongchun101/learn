package com.kafkalearn.l5;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import com.kafkalearn.l5.avro.EventType;
import com.kafkalearn.l5.avro.UserEvent;
import org.apache.avro.io.BinaryEncoder;
import org.apache.avro.io.EncoderFactory;
import org.apache.avro.specific.SpecificDatumWriter;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.Properties;

/**
 * L5 — Avro producer（不依赖 Confluent）。
 *
 * <p>将 {@link UserEvent} 记录编码为 Avro 二进制数据，并将字节发送到
 * Kafka。schema 随 JAR 一同提供。在生产环境中应使用
 * {@code KafkaAvroSerializer}，它会写入 4 字节魔数和 schema id，随后写入 payload。</p>
 */
public final class AvroProducer {

    private static final Logger log = LoggerFactory.getLogger(AvroProducer.class);

    public static void main(String[] args) throws Exception {
        String topic = "l5.avro-events";
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(topic, 3, (short) 3);
        }

        Properties p = new Properties();
        p.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        p.put(ProducerConfig.ACKS_CONFIG, "all");

        SpecificDatumWriter<UserEvent> writer = new SpecificDatumWriter<>(UserEvent.class);
        EventType[] types = EventType.values();
        try (Producer<String, byte[]> producer = new KafkaProducer<>(p)) {
            for (int i = 0; i < 5; i++) {
                UserEvent e = UserEvent.newBuilder()
                        .setUserId("u" + (i % 3))
                        .setType(types[i % types.length])
                        .setAmount(10.0 * i)
                        .setTs(Instant.now().toEpochMilli())
                        .build();

                ByteArrayOutputStream out = new ByteArrayOutputStream();
                BinaryEncoder enc = EncoderFactory.get().binaryEncoder(out, null);
                writer.write(e, enc);
                enc.flush();
                byte[] payload = out.toByteArray();

                producer.send(new ProducerRecord<>(topic, e.getUserId().toString(), payload));
                log.info("sent user={} type={} bytes={}", e.getUserId(), e.getType(), payload.length);
            }
            producer.flush();
        }
    }
}
