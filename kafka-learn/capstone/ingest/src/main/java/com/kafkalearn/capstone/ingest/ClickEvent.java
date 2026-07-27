package com.kafkalearn.capstone.ingest;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

/**
 * 点击事件 —— capstone 流水线的最小数据单元。
 *
 * <p>由面向用户的移动端 / Web 应用发送,由 ingest 服务接收,
 * 并以 at-least-once 语义转发到 Kafka。</p>
 */
public record ClickEvent(
        @JsonProperty("user_id")   String userId,
        @JsonProperty("url")       String url,
        @JsonProperty("referrer")  String referrer,
        @JsonProperty("session")   String session,
        @JsonProperty("ts")        long   ts
) {
    public static ClickEvent now(String userId, String url, String referrer, String session) {
        return new ClickEvent(userId, url, referrer, session, Instant.now().toEpochMilli());
    }
}
