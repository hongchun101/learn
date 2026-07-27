package com.kafkalearn.l7;

import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.admin.DescribeClusterOptions;
import org.apache.kafka.common.Node;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collection;
import java.util.concurrent.TimeUnit;

/**
 * L7 — KRaft 深入。
 *
 * <p>反复向集群查询当前 controller 以及哪些 broker 是 voter。在你停止 /
 * 重启一个具备 controller 资格的 broker 时跑起来,可以观察到 controller
 * 列的变化。</p>
 */
public final class KRaftDeepDive {

    private static final Logger log = LoggerFactory.getLogger(KRaftDeepDive.class);

    public static void main(String[] args) throws Exception {
        try (KafkaAdmin admin = new KafkaAdmin()) {
            long deadline = System.currentTimeMillis() + Long.parseLong(System.getProperty("durationMs", "120000"));
            while (System.currentTimeMillis() < deadline) {
                Collection<Node> nodes = admin.raw()
                        .describeCluster(new DescribeClusterOptions().timeoutMs(5_000))
                        .nodes()
                        .get(5, TimeUnit.SECONDS);
                Node controller = admin.raw()
                        .describeCluster(new DescribeClusterOptions().timeoutMs(5_000))
                        .controller()
                        .get(5, TimeUnit.SECONDS);
                log.info("controller={} voters={}",
                        controller == null ? -1 : controller.id(),
                        nodes.stream().map(n -> n.id() + "/" + n.host()).toList());
                Thread.sleep(2_000);
            }
        }
    }
}
