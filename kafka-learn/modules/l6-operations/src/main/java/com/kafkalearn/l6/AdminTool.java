package com.kafkalearn.l6;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.admin.ConsumerGroupListing;
import org.apache.kafka.clients.admin.ListConsumerGroupsOptions;
import org.apache.kafka.clients.admin.ListConsumerGroupOffsetsOptions;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.Node;
import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;

/**
 * L6 — 管理工具。打印:
 * <ul>
 *   <li>集群节点 + controller,</li>
 *   <li>所有 consumer group,</li>
 *   <li>每个 group 下每个 partition 的 lag。</li>
 * </ul>
 *
 * <p>这是 {@code kafka-consumer-groups.sh --describe}
 * 和 {@code kafka-broker-api-versions.sh} 管理 CLI 命令的 Java 等价实现。</p>
 */
public final class AdminTool {

    private static final Logger log = LoggerFactory.getLogger(AdminTool.class);

    public static void main(String[] args) throws Exception {
        try (KafkaAdmin admin = new KafkaAdmin()) {
            log.info("--- cluster nodes ---");
            for (Node n : admin.raw().describeCluster().nodes().get()) {
                log.info("  id={} host={} port={} rack={}", n.id(), n.host(), n.port(), n.rack());
            }
            log.info("controller = {}", admin.raw().describeCluster().controller().get());

            log.info("--- consumer groups ---");
            for (ConsumerGroupListing g : admin.raw().listConsumerGroups(new ListConsumerGroupsOptions()).all().get()) {
                log.info("  group: {} state={}", g.groupId(), g.state().orElse(null));
                Map<TopicPartition, OffsetAndMetadata> offs = admin.raw()
                        .listConsumerGroupOffsets(g.groupId(), new ListConsumerGroupOffsetsOptions())
                        .partitionsToOffsetAndMetadata().get();
                Map<TopicPartition, OffsetSpec> req = new HashMap<>();
                offs.keySet().forEach(tp -> req.put(tp, OffsetSpec.latest()));
                Map<TopicPartition, org.apache.kafka.clients.admin.ListOffsetsResult.ListOffsetsResultInfo> end =
                        admin.raw().listOffsets(req).all().get();
                for (Map.Entry<TopicPartition, OffsetAndMetadata> e : offs.entrySet()) {
                    long committed = e.getValue().offset();
                    long latest = end.getOrDefault(e.getKey(),
                            new org.apache.kafka.clients.admin.ListOffsetsResult.ListOffsetsResultInfo(0L, -1L, java.util.Optional.empty())).offset();
                    long lag = Math.max(0, latest - committed);
                    log.info("    {}-{} committed={} latest={} lag={}",
                            e.getKey().topic(), e.getKey().partition(), committed, latest, lag);
                }
            }
        }
    }
}
