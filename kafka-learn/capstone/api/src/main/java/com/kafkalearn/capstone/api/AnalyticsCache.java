package com.kafkalearn.capstone.api;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 由 processor 产出的分析 topic 驱动的内存缓存。生产环境通常会使用 Redis、
 * Druid 或 ClickHouse 做后端,但此缓存足以演示读链路。
 */
@Component
public class AnalyticsCache {

    private final Map<String, AtomicLong> userCounts  = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> urlCounts   = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> sessionCounts = new ConcurrentHashMap<>();

    @KafkaListener(topics = "clicks.by-user-1m", groupId = "capstone-api-user",
                   properties = {"value.deserializer:org.apache.kafka.common.serialization.LongDeserializer"})
    public void onUserWindow(String key, Long count) {
        userCounts.computeIfAbsent(stripWindow(key), k -> new AtomicLong()).addAndGet(count);
    }

    @KafkaListener(topics = "clicks.by-url-5m", groupId = "capstone-api-url",
                   properties = {"value.deserializer:org.apache.kafka.common.serialization.LongDeserializer"})
    public void onUrlWindow(String key, Long count) {
        urlCounts.computeIfAbsent(stripWindow(key), k -> new AtomicLong()).addAndGet(count);
    }

    @KafkaListener(topics = "clicks.session-starts", groupId = "capstone-api-sess",
                   properties = {"value.deserializer:org.apache.kafka.common.serialization.StringDeserializer"})
    public void onSessionStart(String key, String count) {
        sessionCounts.computeIfAbsent(key, k -> new AtomicLong()).incrementAndGet();
    }

    public Map<String, Long> topUsers(int n) {
        return userCounts.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().get(), a.getValue().get()))
                .limit(n)
                .collect(java.util.stream.Collectors.toMap(
                        Map.Entry::getKey, e -> e.getValue().get()));
    }

    public Map<String, Long> topUrls(int n) {
        return urlCounts.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().get(), a.getValue().get()))
                .limit(n)
                .collect(java.util.stream.Collectors.toMap(
                        Map.Entry::getKey, e -> e.getValue().get()));
    }

    public long totalSessions() {
        return sessionCounts.values().stream().mapToLong(AtomicLong::get).sum();
    }

    /** 去掉键末尾的 {@code @<epoch>} 窗口后缀。 */
    private static String stripWindow(String key) {
        int at = key.indexOf('@');
        return at < 0 ? key : key.substring(0, at);
    }
}
