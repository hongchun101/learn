package com.kafkalearn.l5;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;

import java.util.Properties;

/**
 * L5 — MirrorMaker 2 参考配置。
 *
 * <p>MM2 是 Confluent 提供的跨集群、跨数据中心复制工具。
 * 它基于 Connect 实现；此类生成可传给
 * {@code connect-mirror-maker.sh} 的最小属性集。</p>
 *
 * <p>要运行演示，请将源集群指向本地 3-broker 集群，并将目标指向任意
 * 可访问的集群（也可启动第二套 docker-compose 环境，详见文档）。</p>
 */
public final class MirrorMaker2Config {

    private MirrorMaker2Config() {}

    public static Properties sourceCluster() {
        Properties p = new Properties();
        p.put("name", "source");
        p.put("bootstrap.servers", "localhost:19092,localhost:29092,localhost:39092");
        p.put(ConsumerConfig.GROUP_ID_CONFIG, "mm2-source");
        return p;
    }

    public static Properties targetCluster() {
        Properties p = new Properties();
        p.put("name", "target");
        p.put("bootstrap.servers", "localhost:19092,localhost:29092,localhost:39092");  // 改为远程地址
        p.put(ProducerConfig.CLIENT_ID_CONFIG, "mm2-target");
        return p;
    }
}
