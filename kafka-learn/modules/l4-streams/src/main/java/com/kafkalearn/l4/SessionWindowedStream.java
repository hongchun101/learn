package com.kafkalearn.l4;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.KafkaStreams;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.StreamsConfig;
import org.apache.kafka.streams.kstream.Consumed;
import org.apache.kafka.streams.kstream.KStream;
import org.apache.kafka.streams.kstream.KTable;
import org.apache.kafka.streams.kstream.Produced;
import org.apache.kafka.streams.kstream.SessionWindows;
import org.apache.kafka.streams.kstream.Windowed;
import org.apache.kafka.streams.kstream.WindowedSerdes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;

/**
 * L4 — session window 聚合。
 *
 * <p>统计用户在单个 5 分钟 session 中的点击次数
 *（以 1 分钟无活动间隔划分 session）。该模式可用于计算
 * 停留时长或 session 收益指标。</p>
 */
public final class SessionWindowedStream {

    private static final Logger log = LoggerFactory.getLogger(SessionWindowedStream.class);

    public static void main(String[] args) {
        String in  = "l4.session-clicks";
        String out = "l4.session-counts";

        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(in, 3, (short) 3);
            admin.createTopic(out, 3, (short) 3);
        }

        Properties p = new Properties();
        p.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(StreamsConfig.APPLICATION_ID_CONFIG, "l4-session-" + UUID.randomUUID());
        p.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        p.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        StreamsBuilder b = new StreamsBuilder();
        KStream<String, String> clicks = b.stream(in, Consumed.with(Serdes.String(), Serdes.String()));
        KTable<Windowed<String>, Long> sessions = clicks
                .groupByKey()
                .windowedBy(SessionWindows.ofInactivityGapAndGrace(Duration.ofMinutes(1), Duration.ofMinutes(5)))
                .count();

        sessions
            .toStream()
            .map((k, v) -> new org.apache.kafka.streams.KeyValue<>(k.key() + "@" + k.window().start() + "-" + k.window().end(), v))
            .to(out, Produced.with(Serdes.String(), Serdes.Long()));

        KafkaStreams streams = new KafkaStreams(b.build(), p);
        CountDownLatch latch = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { streams.close(); latch.countDown(); }));
        streams.start();
        log.info("SessionWindowedStream started {} -> {}", in, out);
        try { latch.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
