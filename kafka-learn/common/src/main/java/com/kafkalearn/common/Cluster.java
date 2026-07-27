package com.kafkalearn.common;

import org.apache.kafka.clients.CommonClientConfigs;

import java.util.List;

/**
 * 集群的集中配置。
 *
 * <p>仓库中的每个模块都使用相同的 bootstrap servers，因此
 * 仓库根目录中的 docker-compose 集群是唯一事实来源。
 * 连接远程集群时，可通过环境变量 {@code KAFKA_BOOTSTRAP_SERVERS}、
 * {@code SCHEMA_REGISTRY_URL}、{@code KAFKA_CONNECT_URL} 覆盖配置。</p>
 */
public final class Cluster {

    private Cluster() {}

    /** 每个实验使用的默认 3-broker PLAINTEXT bootstrap 列表。 */
    public static final String DEFAULT_BOOTSTRAP =
            "localhost:19092,localhost:29092,localhost:39092";

    public static final String DEFAULT_SCHEMA_REGISTRY = "http://localhost:18081";
    public static final String DEFAULT_CONNECT_URL      = "http://localhost:18083";

    public static String bootstrap() {
        return env("KAFKA_BOOTSTRAP_SERVERS", DEFAULT_BOOTSTRAP);
    }

    public static List<String> bootstrapList() {
        return List.of(bootstrap().split(","));
    }

    public static String schemaRegistry() {
        return env("SCHEMA_REGISTRY_URL", DEFAULT_SCHEMA_REGISTRY);
    }

    public static String connectUrl() {
        return env("KAFKA_CONNECT_URL", DEFAULT_CONNECT_URL);
    }

    /** 通用 client ID 前缀；便于在 JMX / 日志中筛选。 */
    public static String clientId(String tag) {
        return "kl-" + tag + "-" + System.getProperty("user.name", "anon");
    }

    public static String env(String key, String fallback) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? fallback : v;
    }

    /** PLAINTEXT 集群的标准安全协议字符串。 */
    public static String securityProtocol() {
        return CommonClientConfigs.DEFAULT_SECURITY_PROTOCOL;
    }
}
