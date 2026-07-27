package com.kafkalearn.l6;

import com.kafkalearn.common.Metrics;
import com.sun.net.httpserver.HttpServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicLong;

/**
 * L6 — 嵌入一个 Prometheus scrape 端点并暴露应用层 metrics。
 * 与其它 benchmark 一起运行,然后让 Prometheus 抓取
 * {@code http://localhost:9100/metrics}。
 */
public final class PrometheusScrapeEndpoint {

    private static final Logger log = LoggerFactory.getLogger(PrometheusScrapeEndpoint.class);

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(9100), 0);
        server.createContext("/metrics", ex -> {
            byte[] body = Metrics.scrape().getBytes();
            ex.sendResponseHeaders(200, body.length);
            try (var os = ex.getResponseBody()) { os.write(body); }
        });
        server.start();
        log.info("metrics endpoint at http://localhost:9100/metrics");

        // 持续产生 60s 数据,让 Prometheus scrape 有内容
        AtomicLong n = new AtomicLong();
        for (int i = 0; i < 60; i++) {
            Metrics.counter("kl_demo_events_total", "kind", "scrape").increment();
            n.incrementAndGet();
            Thread.sleep(1000);
        }
        log.info("emitted {} demo events, exiting", n.get());
        server.stop(0);
    }
}
