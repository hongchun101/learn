package com.kafkalearn.common;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.common.errors.TopicExistsException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

/**
 * 每个实验使用的 {@link AdminClient} 轻量封装。
 * 集群辅助类隐藏集群配置，让实验代码专注于自身逻辑。
 */
public final class KafkaAdmin implements AutoCloseable {


    private static final Logger log = LoggerFactory.getLogger(KafkaAdmin.class);

    private final AdminClient admin;

    public KafkaAdmin() {
        Properties p = new Properties();
        p.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, Cluster.bootstrap());
        p.put(AdminClientConfig.CLIENT_ID_CONFIG, Cluster.clientId("admin"));
        p.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, 15_000);
        p.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, 30_000);
        this.admin = AdminClient.create(p);
    }

    /** 幂等地创建 topic；忽略 TopicExistsException。 */
    public void createTopic(String name, int partitions, short replication) {
        try {
            admin.createTopics(java.util.List.of(new NewTopic(name, partitions, replication)))
                  .all()
                  .get();
            log.info("created topic {} (p={}, rf={})", name, partitions, replication);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof TopicExistsException) {
                log.info("topic {} already exists", name);
            } else {
                throw new RuntimeException(e);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(e);
        }
    }

    public void createTopic(String name, int partitions, short replication, Map<String, String> configs) {
        NewTopic t = new NewTopic(name, partitions, replication).configs(configs);
        try {
            admin.createTopics(java.util.List.of(t)).all().get();
            log.info("created topic {} (p={}, rf={}, cfg={})", name, partitions, replication, configs);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof TopicExistsException) {
                log.info("topic {} already exists", name);
            } else {
                throw new RuntimeException(e);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(e);
        }
    }

    public void deleteTopic(String name) {
        try {
            admin.deleteTopics(java.util.List.of(name)).all().get();
            log.info("deleted topic {}", name);
        } catch (Exception e) {
            log.warn("delete topic {} failed: {}", name, e.getMessage());
        }
    }

    public java.util.List<String> listTopics() {
        try {
            return admin.listTopics().names().get().stream().sorted().collect(Collectors.toList());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public AdminClient raw() {
        return admin;
    }

    public void close() {
        admin.close();
    }
}
