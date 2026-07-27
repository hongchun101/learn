package com.kafkalearn.l7;

import org.apache.kafka.clients.producer.Partitioner;
import org.apache.kafka.common.Cluster;
import org.apache.kafka.common.PartitionInfo;
import org.apache.kafka.common.utils.Utils;

import java.util.List;
import java.util.Map;

/**
 * L7 — 自定义 {@link Partitioner}。
 *
 * <p>将 key 以特殊前缀 ({@code A:}, {@code B:}, {@code C:}) 开头的数据
 * 路由到固定 partition,以便下游 consumer 可以把线程钉在该 partition 上。
 * 其它 key 走默认的 murmur2 哈希。</p>
 */
public final class AffinityPartitioner implements Partitioner {

    @Override
    public int partition(String topic, Object key, byte[] keyBytes,
                         Object value, byte[] valueBytes, Cluster cluster) {
        List<PartitionInfo> partitions = cluster.partitionsForTopic(topic);
        int numPartitions = partitions.size();
        if (keyBytes == null) {
            return Utils.toPositive(Utils.murmur2(valueBytes)) % numPartitions;
        }
        String s = key.toString();
        if (s.startsWith("A:")) return 0 % numPartitions;
        if (s.startsWith("B:")) return 1 % numPartitions;
        if (s.startsWith("C:")) return 2 % numPartitions;
        // 默认: hash(key) % N — 与 Kafka DefaultPartitioner 一致。
        return Utils.toPositive(Utils.murmur2(keyBytes)) % numPartitions;
    }

    @Override public void close() { /* 无操作 */ }
    @Override public void configure(Map<String, ?> configs) { /* 无操作 */ }
}
