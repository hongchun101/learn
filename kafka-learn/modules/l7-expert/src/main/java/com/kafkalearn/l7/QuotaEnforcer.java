package com.kafkalearn.l7;

import com.kafkalearn.common.KafkaAdmin;
import org.apache.kafka.clients.admin.AlterClientQuotasOptions;
import org.apache.kafka.common.quota.ClientQuotaAlteration;
import org.apache.kafka.common.quota.ClientQuotaEntity;
import org.apache.kafka.common.quota.ClientQuotaFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;

/**
 * L7 — quota 管理。
 *
 * <p>演示在 *user* 层面设置、查看与移除 client quota。quota 由 broker 端强制执行,
 * 用于防止单个吵闹的客户端把集群打爆。</p>
 */
public final class QuotaEnforcer {

    private static final Logger log = LoggerFactory.getLogger(QuotaEnforcer.class);

    public static void main(String[] args) throws Exception {
        try (KafkaAdmin admin = new KafkaAdmin()) {
            // 1. 为用户 'evil' 设置 1 MB/s 的 producer/consumer quota
            ClientQuotaAlteration q = new ClientQuotaAlteration(
                    new ClientQuotaEntity(Map.of(ClientQuotaEntity.USER, "evil")),
                    List.of(
                            new ClientQuotaAlteration.Op("producer_byte_rate", 1_000_000.0),
                            new ClientQuotaAlteration.Op("consumer_byte_rate", 1_000_000.0)
                    ));
            try {
                admin.raw().alterClientQuotas(List.of(q), new AlterClientQuotasOptions()).all().get();
                log.info("set quota for user=evil");
            } catch (ExecutionException e) {
                log.warn("could not set quota: {}", e.getCause().getMessage());
            }

            // 2. 列出所有 quota
            Map<ClientQuotaEntity, Map<String, Double>> all =
                    admin.raw().describeClientQuotas(ClientQuotaFilter.all()).entities().get();
            for (Map.Entry<ClientQuotaEntity, Map<String, Double>> entity : all.entrySet()) {
                log.info("quota entity={} ops={}", entity.getKey(), entity.getValue());
            }

            // 3. 移除 quota
            try {
                admin.raw().alterClientQuotas(List.of(new ClientQuotaAlteration(
                        new ClientQuotaEntity(Map.of(ClientQuotaEntity.USER, "evil")),
                        List.of(new ClientQuotaAlteration.Op("producer_byte_rate", null)))),
                        new AlterClientQuotasOptions()).all().get();
                log.info("removed quota for user=evil");
            } catch (Exception e) {
                log.warn("could not remove quota: {}", e.getMessage());
            }
        }
    }
}
