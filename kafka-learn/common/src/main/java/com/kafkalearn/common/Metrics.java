package com.kafkalearn.common;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.prometheus.PrometheusConfig;
import io.micrometer.prometheus.PrometheusMeterRegistry;

/**
 * 应用级指标（不是 broker 自身的 JMX）。当 JVM 以
 * {@code -Dkl.metricsPort=9100} 启动时，我们提供 Prometheus 抓取端点；同一注册表也由
 * 综合项目中的 Spring Boot 服务共享。
 */
public final class Metrics {

    private static final PrometheusMeterRegistry REGISTRY =
            new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);

    private Metrics() {}

    public static MeterRegistry registry() { return REGISTRY; }

    public static String scrape() { return REGISTRY.scrape(); }

    public static Counter counter(String name, String... tags) {
        return Counter.builder(name).tags(tags).register(REGISTRY);
    }

    public static Timer timer(String name, String... tags) {
        return Timer.builder(name).tags(tags).register(REGISTRY);
    }
}
