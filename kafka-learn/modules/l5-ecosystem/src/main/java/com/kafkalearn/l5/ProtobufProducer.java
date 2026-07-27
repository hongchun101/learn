package com.kafkalearn.l5;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import com.kafkalearn.l5.proto.UserEventOuterClass;
import com.kafkalearn.l5.proto.UserEventOuterClass.EventType;
import com.kafkalearn.l5.proto.UserEventOuterClass.UserEvent;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Properties;

/**
 * L5 — Protobuf producer（手写实现，不依赖 Confluent）。
 *
 * <p>将 {@link UserEvent} 记录编码为 Protobuf 风格的二进制
 * 线格式并发送到 Kafka。保留了相同的 .proto 文件
 * 语法（见 resources/proto），以便在实际构建机器上使用
 * {@code protoc} 生成正式的 Java 类。</p>
 */
public final class ProtobufProducer {

    private static final Logger log = LoggerFactory.getLogger(ProtobufProducer.class);

    public static void main(String[] args) {
        String topic = "l5.proto-events";
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(topic, 3, (short) 3);
        }

        Properties p = new Properties();
        p.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        p.put(ProducerConfig.ACKS_CONFIG, "all");

        try (Producer<String, byte[]> producer = new KafkaProducer<>(p)) {
            for (int i = 0; i < 5; i++) {
                UserEvent e = UserEventOuterClass.newBuilder()
                        .setUserId("u" + i)
                        .setType(EventType.forNumber(i % 3 + 1))
                        .setAmount(1.0 * i)
                        .setTs(Instant.now().toEpochMilli())
                        .build();
                producer.send(new ProducerRecord<>(topic, e.getUserId(), e.toByteArray()));
                log.info("sent user={} type={} bytes={}", e.getUserId(), e.getType(), e.getSerializedSize());
            }
            producer.flush();
        }
    }
}
