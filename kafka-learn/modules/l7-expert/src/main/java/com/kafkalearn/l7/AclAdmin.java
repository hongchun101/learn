package com.kafkalearn.l7;

import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.common.acl.AccessControlEntry;
import org.apache.kafka.common.acl.AclBinding;
import org.apache.kafka.common.acl.AclOperation;
import org.apache.kafka.common.acl.AclPermissionType;
import org.apache.kafka.common.resource.PatternType;
import org.apache.kafka.common.resource.ResourcePattern;
import org.apache.kafka.common.resource.ResourceType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * L7 — ACL 管理。
 *
 * <p>演示在一个 topic 上创建 {@code Create + Describe} ACL,然后列出
 * 所有 ACL。生产环境中应基于最小权限原则授予按 principal / resource
 * 细分的 ACL,并通过 SSO 的 IAM 层做基于角色的用户访问控制。</p>
 */
public final class AclAdmin {

    private static final Logger log = LoggerFactory.getLogger(AclAdmin.class);

    public static void main(String[] args) throws Exception {
        try (KafkaAdmin admin = new KafkaAdmin()) {
            // 1. 创建
            AclBinding bind = new AclBinding(
                    new ResourcePattern(ResourceType.TOPIC, "l7.acl-test", PatternType.LITERAL),
                    new AccessControlEntry("User:alice", "*", AclOperation.READ, AclPermissionType.ALLOW));
            try {
                admin.raw().createAcls(List.of(bind)).all().get();
                log.info("ACL created");
            } catch (Exception e) {
                log.warn("ACL create failed: {}", e.getMessage());
            }

            // 2. 列出
            var all = admin.raw().describeAcls(new org.apache.kafka.common.acl.AclBindingFilter(
                    new org.apache.kafka.common.resource.ResourcePatternFilter(ResourceType.TOPIC, null, PatternType.ANY),
                    new org.apache.kafka.common.acl.AccessControlEntryFilter("User:alice", null, AclOperation.ANY, AclPermissionType.ANY)))
                    .values().get();
            log.info("ACLs for User:alice: {}", all);
        }
    }
}
