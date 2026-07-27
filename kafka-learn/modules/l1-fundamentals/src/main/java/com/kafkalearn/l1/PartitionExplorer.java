package com.kafkalearn.l1;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.admin.DescribeTopicsResult;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.common.TopicPartitionInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * L1 — 描述 topic，并打印其 partitions / leaders / replicas。
 *
 * <p>这是 Kafka 运维中最实用的单条命令：你可以
 * 一眼看出每个 partition 的 leader 位于哪个 broker，
 * 以及哪些 broker 持有 follower replicas。</p>
 */
public final class PartitionExplorer {

    private static final Logger log = LoggerFactory.getLogger(PartitionExplorer.class);

    public static void main(String[] args) throws Exception {
        String topic = args.length > 0 ? args[0] : HelloProducer.TOPIC;
        try (KafkaAdmin admin = new KafkaAdmin()) {
            DescribeTopicsResult r = admin.raw().describeTopics(java.util.List.of(topic));
            Map<String, TopicDescription> all = r.allTopicNames().get();
            for (Map.Entry<String, TopicDescription> e : all.entrySet()) {
                log.info("topic {}", e.getKey());
                for (TopicPartitionInfo p : e.getValue().partitions()) {
                    log.info("  p={} leader={} replicas={} isr={}",
                            p.partition(),
                            p.leader() == null ? "<none>" : p.leader().id(),
                            p.replicas().stream().map(n -> n.id()).toList(),
                            p.isr().stream().map(n -> n.id()).toList());
                }
            }
        }
    }
}
