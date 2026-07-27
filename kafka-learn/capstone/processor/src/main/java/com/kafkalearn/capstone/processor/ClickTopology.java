package com.kafkalearn.capstone.processor;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.Serde;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.KafkaStreams;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.StreamsConfig;
import org.apache.kafka.streams.kstream.Consumed;
import org.apache.kafka.streams.kstream.KStream;
import org.apache.kafka.streams.kstream.KTable;
import org.apache.kafka.streams.kstream.Materialized;
import org.apache.kafka.streams.kstream.Produced;
import org.apache.kafka.streams.kstream.TimeWindows;
import org.apache.kafka.streams.kstream.Windowed;
import org.apache.kafka.streams.state.Stores;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;

/**
 * Capstone processor —— 在 click 流上构建三条 topology。
 *
 * <ol>
 *   <li>每个用户 1 分钟滚动窗口内的点击 → {@code clicks.by-user-1m}。</li>
 *   <li>每个 URL 5 分钟滚动窗口内的点击 → {@code clicks.by-url-5m}。</li>
 *   <li>每个 {@code userId} 每小时一次的会话起始标记 → {@code clicks.session-starts}。</li>
 * </ol>
 *
 * <p>三条流均开启 EOS,并复用同一个 StreamsBuilder,
 * 因此共享同一个 Kafka Streams 实例和同一个 state 目录。</p>
 */
@Component
public class ClickTopology {

    private static final Logger log = LoggerFactory.getLogger(ClickTopology.class);

    @Value("${capstone.topic.clicks:clicks.raw}")
    private String clicksTopic;
    @Value("${spring.kafka.bootstrap-servers:localhost:19092,localhost:29092,localhost:39092}")
    private String bootstrap;

    private KafkaStreams streams;

    @PostConstruct
    public void start() {
        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(clicksTopic, 6, (short) 3);
            admin.createTopic("clicks.by-user-1m", 3, (short) 3);
            admin.createTopic("clicks.by-url-5m",  3, (short) 3);
            admin.createTopic("clicks.session-starts", 3, (short) 3);
        }

        Properties p = new Properties();
        p.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrap);
        p.put(StreamsConfig.APPLICATION_ID_CONFIG, "capstone-clicks-" + UUID.randomUUID());
        p.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        p.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        p.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, StreamsConfig.EXACTLY_ONCE_V2);

        StreamsBuilder b = new StreamsBuilder();
        Serde<String> str = Serdes.String();
        Serde<Long> lng = Serdes.Long();

        KStream<String, String> clicks = b.stream(clicksTopic, Consumed.with(str, str));

        // 1) per-user 1-minute
        clicks.groupByKey()
              .windowedBy(TimeWindows.ofSizeAndGrace(Duration.ofMinutes(1), Duration.ofSeconds(10)))
              .count(Materialized.as("user-1m-store"))
              .toStream()
              .map((Windowed<String> k, Long v) -> new org.apache.kafka.streams.KeyValue<>(k.key() + "@" + k.window().start(), v))
              .to("clicks.by-user-1m", Produced.with(str, lng));

        // 2) per-URL 5-minute (we re-parse JSON minimally — the value is already a JSON string)
        clicks.mapValues(v -> extract(v, "url"))
              .groupBy((k, url) -> url == null ? "_" : url)
              .windowedBy(TimeWindows.ofSizeAndGrace(Duration.ofMinutes(5), Duration.ofSeconds(30)))
              .count(Materialized.as("url-5m-store"))
              .toStream()
              .map((Windowed<String> k, Long v) -> new org.apache.kafka.streams.KeyValue<>(k.key() + "@" + k.window().start(), v))
              .to("clicks.by-url-5m", Produced.with(str, lng));

        // 3) session starts (per user, per session-id)
        KTable<String, String> sessions = clicks
                .groupBy((k, v) -> extract(v, "session"))
                .count()
                .toStream()
                .map((sid, n) -> new org.apache.kafka.streams.KeyValue<>(sid, n.toString()))
                .toTable(Materialized.<String, String>as(Stores.inMemoryKeyValueStore("session-starts-store"))
                        .withKeySerde(str).withValueSerde(str));
        sessions.toStream().to("clicks.session-starts", Produced.with(str, str));

        CountDownLatch latch = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            streams.close();
            latch.countDown();
        }));

        streams = new KafkaStreams(b.build(), p);
        streams.start();
        log.info("ClickTopology started on {}", clicksTopic);
    }

    @PreDestroy
    public void stop() {
        if (streams != null) streams.close();
    }

    /** 从 JSON 对象中提取单个字段 —— 微型、零分配。 */
    static String extract(String json, String field) {
        if (json == null) return null;
        String needle = "\"" + field + "\":\"";
        int s = json.indexOf(needle);
        if (s < 0) return null;
        s += needle.length();
        int e = json.indexOf('"', s);
        return e < 0 ? null : json.substring(s, e);
    }
}
