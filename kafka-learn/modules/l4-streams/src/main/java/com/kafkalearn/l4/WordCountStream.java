package com.kafkalearn.l4;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.KafkaStreams;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.StreamsConfig;
import org.apache.kafka.streams.kstream.KStream;
import org.apache.kafka.streams.kstream.KTable;
import org.apache.kafka.streams.kstream.Produced;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;

/**
 * L4 — 经典的 Kafka Streams 单词计数。
 *
 * <p>从 {@code l4.lines} 读取句子，将其展开为单词并计数，
 * 再将持续更新的总数写入 {@code l4.word-counts}。其中有状态的部分是
 * {@code KTable}：它由压缩的 changelog topic 支持，并可在重启后恢复。</p>
 */
public final class WordCountStream {

    private static final Logger log = LoggerFactory.getLogger(WordCountStream.class);

    public static void main(String[] args) {
        String in  = "l4.lines";
        String out = "l4.word-counts";

        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(in, 3, (short) 3);
            admin.createTopic(out, 3, (short) 3);
        }

        Properties p = new Properties();
        p.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(StreamsConfig.APPLICATION_ID_CONFIG, "l4-word-count-" + UUID.randomUUID());
        p.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        p.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        // 恰好一次语义（EOS）
        p.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, StreamsConfig.EXACTLY_ONCE_V2);

        StreamsBuilder b = new StreamsBuilder();
        KStream<String, String> lines = b.stream(in);
        KTable<String, Long> counts = lines
                .flatMapValues(v -> java.util.List.of(v.toLowerCase().split("\\W+")))
                .filter((k, w) -> !w.isEmpty())
                .groupByKey()
                .count();

        counts.toStream().to(out, Produced.with(Serdes.String(), Serdes.Long()));

        KafkaStreams streams = new KafkaStreams(b.build(), p);
        CountDownLatch latch = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            streams.close();
            latch.countDown();
        }));

        streams.start();
        log.info("WordCountStream started on {} -> {}", in, out);
        try { latch.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
