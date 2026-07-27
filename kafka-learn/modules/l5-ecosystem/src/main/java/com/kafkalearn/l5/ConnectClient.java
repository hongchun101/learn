package com.kafkalearn.l5;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kafkalearn.common.Cluster;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

/**
 * L5 — Kafka Connect REST 客户端。
 *
 * <p>提交一个 {@code FileStreamSource} connector，从文件读取各行并写入
 * topic。随后列出正在运行的 connector 及其各自的状态。</p>
 */
public final class ConnectClient {

    private static final Logger log = LoggerFactory.getLogger(ConnectClient.class);
    private static final ObjectMapper M = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        String base = Cluster.connectUrl();
        HttpClient http = HttpClient.newHttpClient();
        try {
            // 1. 创建读取 /tmp/connect-input.txt 的 FileStreamSource
            String config = M.writeValueAsString(Map.of(
                    "name",  "l5-file-source",
                    "config", Map.of(
                            "connector.class", "org.apache.kafka.connect.file.FileStreamSourceConnector",
                            "tasks.max",       "1",
                            "file",            "/tmp/connect-input.txt",
                            "topic",           "l5.connect-source"
                    )
            ));
            HttpRequest post = HttpRequest.newBuilder(URI.create(base + "/connectors"))
                    .header("Content-Type", "application/json")
                    .PUT(HttpRequest.BodyPublishers.ofString(config))
                    .build();
            HttpResponse<String> resp = http.send(post, HttpResponse.BodyHandlers.ofString());
            log.info("create status={} body={}", resp.statusCode(), resp.body());

            // 2. 列出 connector
            HttpRequest list = HttpRequest.newBuilder(URI.create(base + "/connectors")).build();
            HttpResponse<String> lr = http.send(list, HttpResponse.BodyHandlers.ofString());
            log.info("connectors: {}", lr.body());

            // 3. 查询状态
            HttpRequest stat = HttpRequest.newBuilder(URI.create(base + "/connectors/l5-file-source/status")).build();
            HttpResponse<String> sr = http.send(stat, HttpResponse.BodyHandlers.ofString());
            log.info("status: {}", sr.body());
        } finally {
            // Java 11 HttpClient 没有 close()；此 try-finally 用于表明设计意图。
        }
    }
}
