package com.kafkalearn.l2;

import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.TopicPartitionInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * L2 —— 展示 topic 每个 partition 的 *最早可用* offset 和 *最新* offset。
 * 二者结合可反映日志的保留窗口。
 */
public final class SegmentInspector {

    private static final Logger log = LoggerFactory.getLogger(SegmentInspector.class);

    public static void main(String[] args) throws Exception {
        String topic = args.length > 0 ? args[0] : "l1.greetings";
        try (KafkaAdmin admin = new KafkaAdmin()) {
            List<TopicPartitionInfo> partitions = admin.raw()
                    .describeTopics(List.of(topic))
                    .allTopicNames().get()
                    .get(topic)
                    .partitions();

            Map<TopicPartition, OffsetSpec> earliestReq = new HashMap<>();
            Map<TopicPartition, OffsetSpec> latestReq   = new HashMap<>();
            for (TopicPartitionInfo p : partitions) {
                TopicPartition tp = new TopicPartition(topic, p.partition());
                earliestReq.put(tp, OffsetSpec.earliest());
                latestReq.put(tp, OffsetSpec.latest());
            }
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> earliest =
                    admin.raw().listOffsets(earliestReq).all().get();
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latest =
                    admin.raw().listOffsets(latestReq).all().get();

            TreeMap<Integer, long[]> rows = new TreeMap<>();
            for (TopicPartitionInfo p : partitions) {
                TopicPartition tp = new TopicPartition(topic, p.partition());
                rows.put(p.partition(), new long[] {
                        earliest.get(tp).offset(),
                        latest.get(tp).offset()
                });
            }
            log.info("topic={}", topic);
            for (Map.Entry<Integer, long[]> e : rows.entrySet()) {
                log.info("  p{} low={} high={} count={}",
                        e.getKey(), e.getValue()[0], e.getValue()[1],
                        e.getValue()[1] - e.getValue()[0]);
            }
        }
    }
}
