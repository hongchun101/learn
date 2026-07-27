package com.kafkalearn.l2;

import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.admin.ListConsumerGroupOffsetsResult;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.TopicPartitionInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * L2 —— 展示 topic 每个 partition 的末端 offset、消费者 group 的已提交 offset
 * 以及 lag。这正是 {@code kafka-consumer-groups --describe} 内部做的事情。
 */
public final class ReplicaLagDemo {

    private static final Logger log = LoggerFactory.getLogger(ReplicaLagDemo.class);

    public static void main(String[] args) throws Exception {
        String topic = args.length > 0 ? args[0] : "l1.greetings";
        String group = args.length > 1 ? args[1] : "l1-hello";
        try (KafkaAdmin admin = new KafkaAdmin()) {
            // 1. 末端 offset
            List<TopicPartitionInfo> partitions = admin.raw()
                    .describeTopics(List.of(topic))
                    .allTopicNames().get().get(topic).partitions();
            Map<TopicPartition, OffsetSpec> request = new HashMap<>();
            for (TopicPartitionInfo p : partitions) {
                request.put(new TopicPartition(topic, p.partition()), OffsetSpec.latest());
            }
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> ends =
                    admin.raw().listOffsets(request).all().get();

            // 2. 已提交 offset
            ListConsumerGroupOffsetsResult committedResult = admin.raw().listConsumerGroupOffsets(group);
            Map<TopicPartition, OffsetAndMetadata> offs = committedResult.partitionsToOffsetAndMetadata().get();

            log.info("topic={} group={}", topic, group);
            long totalLag = 0;
            for (Map.Entry<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> e : ends.entrySet()) {
                long end = e.getValue().offset();
                long committed = offs.getOrDefault(e.getKey(), new OffsetAndMetadata(0)).offset();
                long lag = Math.max(0, end - committed);
                totalLag += lag;
                log.info("  {}-{} end={} committed={} lag={}",
                        e.getKey().topic(), e.getKey().partition(), end, committed, lag);
            }
            log.info("total lag = {}", totalLag);
        }
    }
}
