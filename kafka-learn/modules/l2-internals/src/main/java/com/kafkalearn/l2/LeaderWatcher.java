package com.kafkalearn.l2;

import com.kafkalearn.common.Cluster;
import com.kafkalearn.common.KafkaAdmin;
import com.kafkalearn.common.Waits;
import org.apache.kafka.clients.admin.DescribeTopicsResult;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.common.TopicPartitionInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * L2 —— 持续观察 partition 的 leader 变化。
 *
 * <p>每隔 {@code pollMs} 打印一次 topic 每个 partition 的 leader broker。
 * 启动该 lab 后 kill 掉其中一个 broker（例如 {@code docker stop kl-kafka-2}），
 * 即可观察到 leader 列的变化。</p>
 */
public final class LeaderWatcher {

    private static final Logger log = LoggerFactory.getLogger(LeaderWatcher.class);

    public static void main(String[] args) throws Exception {
        String topic = args.length > 0 ? args[0] : "l1.greetings";
        long durationMs = Long.parseLong(System.getProperty("durationMs", "120000"));
        long pollMs    = Long.parseLong(System.getProperty("pollMs", "2000"));

        try (KafkaAdmin admin = new KafkaAdmin()) {
            long deadline = System.currentTimeMillis() + durationMs;
            Map<Integer, Integer> last = new HashMap<>();
            while (System.currentTimeMillis() < deadline) {
                DescribeTopicsResult r = admin.raw().describeTopics(java.util.List.of(topic));
                Map<Integer, Integer> current = new TreeMap<>();
                for (Map.Entry<String, TopicDescription> e : r.allTopicNames().get().entrySet()) {
                    for (TopicPartitionInfo p : e.getValue().partitions()) {
                        current.put(p.partition(), p.leader() == null ? -1 : p.leader().id());
                    }
                }
                StringBuilder line = new StringBuilder("leaders:");
                for (Map.Entry<Integer, Integer> e : current.entrySet()) {
                    String mark = String.valueOf(e.getValue());
                    if (last.containsKey(e.getKey()) && !last.get(e.getKey()).equals(e.getValue())) {
                    mark = e.getValue() + "*";  // 星号 = 已变更
                    }
                    line.append(" p").append(e.getKey()).append("→").append(mark);
                }
                log.info(line.toString());
                last = current;
                Waits.sleep(pollMs);
            }
        }
    }
}
