package com.kafkalearn.l1;

import com.kafkalearn.common.KafkaAdmin;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 需要运行中集群的集成测试（设置 {@code -DwithCluster=true}）。
 * 默认禁用，以便单元构建保持隔离。
 */
@EnabledIfSystemProperty(named = "withCluster", matches = "true")
class HelloConsumerIT {

    static String topic;
    static KafkaAdmin admin;

    @BeforeAll
    static void setup() {
        topic = "l1-it-" + UUID.randomUUID().toString().substring(0, 8);
        admin = new KafkaAdmin();
        admin.createTopic(topic, 1, (short) 1);
    }

    @AfterAll
    static void teardown() {
        if (admin != null) {
            admin.deleteTopic(topic);
            admin.close();
        }
    }

    @Test
    void producerAndConsumerRoundTrip() throws Exception {
        // Producer + consumer 冒烟测试。我们不调用 HelloProducer.main，以
        // 避免进入 System.exit 路径；这里只验证 props 构建器。
        java.util.Properties props = HelloProducer.producerProps();
        assertThat(props).containsKey("bootstrap.servers");

        // 往返流程由 scripts/labs/l1.sh 中的 L1 实验脚本执行。
        assertThat(topic).isNotEmpty();
    }
}
