package com.kafkalearn.l4;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.KafkaStreams;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.StreamsConfig;
import org.apache.kafka.streams.kstream.Consumed;
import org.apache.kafka.streams.kstream.JoinWindows;
import org.apache.kafka.streams.kstream.KStream;
import org.apache.kafka.streams.kstream.KTable;
import org.apache.kafka.streams.kstream.Produced;
import org.apache.kafka.streams.kstream.StreamJoined;
import org.apache.kafka.streams.kstream.ValueJoiner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;

/**
 * L4 — stream-table join：使用用户资料丰富点击事件。
 *
 * <pre>
 *   点击  ──── KStream<userId, Click>
 *                  │
 *                  │  KTable<userId, Profile>（来自 user-profiles topic）
 *                  ▼
 *              value 连接器
 *                  │
 *                  ▼
 *           已丰富（userId、click+profile）
 * </pre>
 */
public final class ClickStreamEnrichment {

    private static final Logger log = LoggerFactory.getLogger(ClickStreamEnrichment.class);
    private static final ObjectMapper M = new ObjectMapper();

    public static void main(String[] args) {
        String clicksTopic    = "l4.clicks";
        String profilesTopic  = "l4.user-profiles";
        String enrichedTopic  = "l4.clicks-enriched";

        try (KafkaAdmin admin = new KafkaAdmin()) {
            admin.createTopic(clicksTopic,   3, (short) 3);
            admin.createTopic(profilesTopic, 3, (short) 3);
            admin.createTopic(enrichedTopic, 3, (short) 3);
        }

        Properties p = new Properties();
        p.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(StreamsConfig.APPLICATION_ID_CONFIG, "l4-enrich-" + UUID.randomUUID());
        p.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        p.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        StreamsBuilder b = new StreamsBuilder();

        KStream<String, String> clicks = b.stream(clicksTopic, Consumed.with(Serdes.String(), Serdes.String()));
        KTable<String, String> profiles = b.table(profilesTopic, Consumed.with(Serdes.String(), Serdes.String()));

        ValueJoiner<String, String, String> joiner = (click, profile) -> {
            try {
                JsonNode c = M.readTree(click);
                JsonNode u = profile == null ? M.createObjectNode() : M.readTree(profile);
                ((com.fasterxml.jackson.databind.node.ObjectNode) c).set("profile", u);
                return M.writeValueAsString(c);
            } catch (Exception e) {
                return click + " | profile=" + profile;
            }
        };

        clicks.join(profiles, joiner).to(enrichedTopic, Produced.with(Serdes.String(), Serdes.String()));

        KafkaStreams streams = new KafkaStreams(b.build(), p);
        CountDownLatch latch = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { streams.close(); latch.countDown(); }));
        streams.start();
        log.info("ClickStreamEnrichment started: {} + {} -> {}", clicksTopic, profilesTopic, enrichedTopic);
        try { latch.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
