# 04 · 成本治理(存算分离 / 弹性 / 冷热分层 / FinOps)

> **本章目标**:把大数据集群成本从"500w/月"压到"150w/月"。覆盖存算分离、弹性计算、冷热分层、Spot 实例、K8s HPA/VPA、内部计算治理计费、FinOps 体系。
> **核心思路**:成本 = 计算 + 存储 + 网络 + 人工,**每一项都能砍 30%+**。
> **方法论**:**4R 模型**:Right-sizing / Right-timing / Right-pricing / Right-architecture。

---

## 0. 成本结构全景

```
月度大数据集群账单 (中型公司,1PB 数据,日均 30w 任务)

┌────────────────────────────────────────────────────────────┐
│  计算 60%  │ 存储 25%  │ 网络 8%  │ 其他 7%               │
│  Spark/Flink/YARN/K8s │ OSS/HDFS/S3 │ 跨 AZ / 跨 region │ SaaS/工具 │
└────────────────────────────────────────────────────────────┘

优化优先级:
  1. 计算资源(最大头) → 弹性 / Spot / Serverless
  2. 存储(第二大头)  → 冷热分层 / 压缩 / 归档
  3. 网络             → 同 AZ / 减少跨 region
  4. 架构             → 存算分离 / 多集群
```

---

## 1. 存算分离:架构级成本最优解

### 1.1 传统 HDFS(存算一体)的痛

- 计算和存储绑死,扩容必须 1:1 加节点;
- 计算低峰期机器空转;
- 存储浪费(老数据占 70%,但价值低)。

### 1.2 存算分离架构

```
┌──────────────────────┐       ┌──────────────────────┐
│ 计算层 (弹性伸缩)     │       │ 存储层 (低成本)       │
│ Spark on K8s         │  RPC  │ S3 / OSS / COS        │
│ Flink on K8s         │ ←──→  │ Iceberg / Hudi 表     │
│ Presto/Trino         │       │ 归档 / 冷数据          │
└──────────────────────┘       └──────────────────────┘
              ↓                            ↓
        几十秒扩缩容                  无限容量 / GB 单价低
        按需 / Spot 实例              标准 / 低频 / 归档
```

### 1.3 三种主流存算分离方案对比

| 方案 | 存储 | 计算 | 适用 |
| --- | --- | --- | --- |
| **Spark on S3 + Glue Catalog** | S3 | EMR / Glue / Spark on K8s | AWS / 跨云 |
| **OSS + JindoFS / OSS-HDFS** | OSS(阿里) | Spark on ACK / EMR | 阿里云 |
| **COS + GooseFS** | COS(腾讯) | Spark on TKE | 腾讯云 |
| **JuiceFS** | S3 + 元数据(Redis/TiKV) | Spark / Flink on K8s | 自建 / 多云 |

### 1.4 JuiceFS 部署案例

```yaml
# JuiceFS Helm 安装(简化)
apiVersion: v1
kind: PersistentVolume
metadata:
  name: jfs-pv
spec:
  capacity:
    storage: 100Ti
  volumeMode: Filesystem
  accessModes: [ReadWriteMany]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: juicefs
  csi:
    driver: csi.juicefs.com
    volumeHandle: my-jfs
    nodePublishSecretRef:
      name: juicefs-secret
      namespace: default
    volumeAttributes:
      bucket: "https://my-bucket.s3.amazonaws.com"
      metaurl: "redis://:password@redis:6379/1"
      storageClass: "STANDARD_IA"
```

**优势**:
- 兼容 POSIX,**Spark / Flink 无需改代码**;
- 元数据用 Redis / TiKV,延迟 < 1ms;
- 数据落 S3,冷数据自动转 Glacier。

### 1.5 存算分离的工程坑

| 坑 | 解决 |
| --- | --- |
| 远程 shuffle 慢 | Apache Celeborn + 本地缓存 |
| 元数据压力大 | Redis Cluster / TiKV |
| 小文件 IO 放大 | 攒批 + 合并 |
| 一致性弱 | Iceberg ACID + 定期 checkpoint |

---

## 2. 弹性计算:让集群按需呼吸

### 2.1 弹性策略分类

| 策略 | 适用 | 节省 |
| --- | --- | --- |
| **HPA(水平)** | 服务类(API、Presto) | 30–60% |
| **VPA(垂直)** | 批处理(短任务) | 20–40% |
| **Cron 定时** | 周期任务(每天凌晨跑) | 40–70% |
| **Spot / Preemptible** | 容错批任务 | **60–80%** |
| **Serverless** | 偶发查询 / Ad-hoc | 50%+ |

### 2.2 K8s HPA 实操

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: spark-thrift-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: spark-thrift-server
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: spark_thrift_active_connections
      target:
        type: AverageValue
        averageValue: "10"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300     # 慢缩,避免抖动
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
```

### 2.3 VPA(Vertical Pod Autoscaler)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: spark-driver-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: spark-batch-driver
  updatePolicy:
    updateMode: "Auto"          # Auto = 自动 + 重启 Pod
  resourcePolicy:
    containerPolicies:
    - containerName: spark-driver
      minAllowed:
        cpu: "1"
        memory: "4Gi"
      maxAllowed:
        cpu: "16"
        memory: "64Gi"
      controlledResources: ["cpu", "memory"]
```

**注意**:VPA 会**重启 Pod**,不适合长任务(用 Spark Dynamic Allocation 替代)。

### 2.4 Cron 定时伸缩(KEDA)

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: spark-batch-cron
spec:
  scaleTargetRef:
    name: spark-batch
  minReplicaCount: 0                  # 凌晨 0 点完全缩 0
  maxReplicaCount: 50
  triggers:
  - type: cron
    metadata:
      timezone: Asia/Shanghai
      start: 0 0 * * *               # 每天 0 点起
      end: 0 6 * * *                 # 6 点止
      desiredReplicas: "30"
```

### 2.5 Spark Dynamic Allocation

```conf
spark.dynamicAllocation.enabled=true
spark.dynamicAllocation.minExecutors=0
spark.dynamicAllocation.maxExecutors=100
spark.dynamicAllocation.initialExecutors=2
spark.dynamicAllocation.executorIdleTimeout=60s
spark.shuffle.service.enabled=true      # 必须
```

---

## 3. Spot / Preemptible 实例:大杀器

### 3.1 Spot 实例的省钱幅度

| 实例类型 | 价格折扣 | 中断概率 |
| --- | --- | --- |
| **AWS Spot** | 60–90% off | < 5%/小时(常稳) |
| **Azure Spot** | 60–80% off | 中 |
| **阿里云抢占式** | 60–90% off | 中 |
| **腾讯云竞价** | 60–80% off | 中 |

### 3.2 Spot 适用场景

- ✅ **离线批处理**(Spark SQL、Hive)
- ✅ **Pre-train 训练**(检查点 + 自动重启)
- ✅ **冷查询 / Ad-hoc**(Presto、ClickHouse)
- ❌ **核心在线服务**(API Gateway)
- ❌ **状态强一致的任务**(Flink Exactly-Once)

### 3.3 Spark on Spot 实战

```bash
spark-submit \
    --master k8s://https://k8s-api:6443 \
    --deploy-mode cluster \
    --conf spark.executor.instances=100 \
    --conf spark.kubernetes.nodeSelector.label=node-type=spot \
    --conf spark.kubernetes.nodeSelector.label=capacity-type=spot \
    --conf spark.task.maxFailures=4 \
    --conf spark.stage.maxConsecutiveAttempts=5 \
    --conf spark.kubernetes.executor.podTemplateFile=/tmp/spark-spot.yaml \
    --conf spark.driver.maxResultSize=2g \
    local:///opt/spark/jars/spark-app.jar
```

`pod-template` 里:
```yaml
spec:
  tolerations:
  - key: "cloud.google.com/preemptible"
    operator: "Equal"
    value: "true"
    effect: "NoSchedule"
  nodeSelector:
    node-type: spot
```

### 3.4 Spot 中断处理

```python
# Spark 3.5 提供的中断感知
spark.conf.set("spark.kubernetes.executor.scheduledShutdown.enabled", "true")
# 收到中断信号前 90s,优雅关闭 executor
```

**Checklist**:
- [ ] `task.maxFailures` 调到 4
- [ ] 检查点(snapshot)保存中间结果
- [ ] shuffle 服务用 Celeborn(off-heap)
- [ ] 监控 Spot 回收率,> 5% 切回 On-Demand

---

## 4. 冷热分层:存储优化最大杠杆

### 4.1 存储分层模型

```
热数据(< 7 天,日访问 100+ 次) → SSD / 本地 NVMe
温数据(7–30 天,周访问 1+ 次) → 标准对象存储(S3 Standard / OSS 标准)
冷数据(30–180 天,月访问 1+ 次) → 低频(S3 IA / OSS 低频)
归档数据(> 180 天,基本不查) → 归档(S3 Glacier / OSS 归档)
```

**单价对比**:
| 存储类型 | S3 单价(GB/月) | OSS 单价 | 备注 |
| --- | --- | --- | --- |
| Standard | $0.023 | ¥0.12 | 标准 |
| IA(低频) | $0.0125 | ¥0.08 | 30 天最小 |
| Glacier Instant | $0.004 | ¥0.05 | 实时取回 |
| Glacier Deep Archive | $0.00099 | ¥0.015 | 12 小时取回 |

**结论**:Glacier Deep Archive 比 Standard 便宜 **23×**。

### 4.2 Iceberg 自动分层

```sql
-- Iceberg 1.4+ 内置 storage optimization
CALL system.orphan_data_files(table => 'db.t');

-- 自动 expire snapshot + 移动旧文件到 IA
CALL system.expire_snapshots(
    table => 'db.t',
    older_than => TIMESTAMP '2026-01-01 00:00:00'
);
```

### 4.3 OSS 生命周期规则

```json
{
  "Rules": [
    {
      "ID": "log-archive",
      "Status": "Enabled",
      "Prefix": "logs/",
      "Transitions": [
        { "Days": 30, "StorageClass": "IA" },
        { "Days": 90, "StorageClass": "Archive" }
      ],
      "Expiration": { "Days": 730 }
    },
    {
      "ID": "data-tiering",
      "Status": "Enabled",
      "Prefix": "iceberg/dwd/",
      "Transitions": [
        { "Days": 7, "StorageClass": "IA" }
      ]
    }
  ]
}
```

### 4.4 Doris 冷热分层

```sql
ALTER TABLE dwd.dwd_order
SET (
    "storage_cooldown_ttl" = "30 day",
    "storage_medium" = "SSD"
);
-- 30 天后自动迁移到 HDD
```

**节省**:Doris 集群 HDD 比 SSD 便宜 50%。

### 4.5 压缩:ZSTD + 列存

```conf
# Iceberg 默认 ZSTD,推荐 level=3
write.parquet.compression-codec=zstd
write.parquet.compression-level=3
write.parquet.dict-size=1048576

# 测试对比(Snappy vs ZSTD)
# Snappy 压缩率 2.1×, 解压 500 MB/s
# ZSTD  压缩率 3.5×, 解压 400 MB/s
# 结论:写多读少用 ZSTD,读多写少用 LZ4
```

**单这一项可省 30–50% 存储**。

---

## 5. K8s Resource 治理:HPA / VPA / Karpenter

### 5.1 Karpenter(下一代节点弹性)

Karpenter 是 AWS 开源的节点级弹性组件,**比 Cluster Autoscaler 快 10×**。

```yaml
# NodePool(类似 nodeGroup)
apiVersion: karpenter.sh/v1alpha5
kind: NodePool
metadata:
  name: spot-pool
spec:
  template:
    spec:
      requirements:
      - key: karpenter.sh/capacity-type
        operator: In
        values: ["spot", "on-demand"]
      - key: kubernetes.io/arch
        operator: In
        values: ["amd64"]
      nodeClassRef:
        name: default
  limits:
    cpu: "1000"
    memory: 4000Gi
  disruption:
    consolidationPolicy: WhenUnderutilized
    expireAfter: 720h                    # 30 天过期
```

**优势**:
- 30 秒拉起新节点(Cluster Autoscaler 5 分钟);
- 自动选最便宜的实例类型;
- 自动 Spot 中断后迁移。

### 5.2 FinOps 内部计费

#### 5.2.1 内部计费模型

```
每个 Spark/Flink 作业:
  cpu_hours = executor.cores × runtime_hours × num_executors
  memory_gb_hours = executor.memory × runtime_hours / 1024 / 1024 / 1024
  storage_gb = table_size_gb
  cost = cpu_hours × 0.5 + memory_gb_hours × 0.1 + storage_gb × 0.01
```

#### 5.2.2 埋点实现

```python
# Spark Listener 监听作业结束事件
class CostListener(SparkListener):
    def onApplicationEnd(self, appEnd):
        app_id = appEnd.applicationId
        runtime = appEnd.time - appStart.time
        executors = spark.sparkContext.statusTracker.getExecutorInfos()
        total_cpu = sum(e.totalCores for e in executors)
        total_mem_gb = sum(e.totalMaxMemory / 1024**3 for e in executors)
        cost = total_cpu * (runtime/3600) * 0.5 + total_mem_gb * (runtime/3600) * 0.1
        
        # 推送到 Kafka → Iceberg → BI
        send_to_kafka({
            "app_id": app_id,
            "app_name": appName,
            "user": user,
            "team": team,
            "cpu_hours": total_cpu * runtime/3600,
            "mem_gb_hours": total_mem_gb * runtime/3600,
            "cost_rmb": cost,
            "dt": today(),
        })
```

#### 5.2.3 成本分摊表(Iceberg)

```sql
-- 按部门 / 作业 / 用户维度
SELECT
    team,
    user,
    SUM(cost_rmb) AS total_cost
FROM cost.dwd_job_cost
WHERE dt >= '2026-07-01'
GROUP BY team, user
ORDER BY total_cost DESC
LIMIT 20;
```

### 5.3 配额管理(Quota)

```yaml
# K8s ResourceQuota
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-data-team
  namespace: data-team
spec:
  hard:
    requests.cpu: "200"
    requests.memory: "800Gi"
    persistentvolumeclaims: "50"
    requests.nvidia.com/gpu: "20"
```

---

## 6. FinOps 体系:组织 + 流程 + 工具

### 6.1 FinOps 三阶段

```
Inform(可视化) → Optimize(优化) → Operate(治理)
```

| 阶段 | 目标 | 工具 |
| --- | --- | --- |
| **Inform** | 成本可视化,谁花多少 | 云厂商账单 + 自研计费 |
| **Optimize** | 持续优化:Savings Plans / Spot / 资源回收 | Karpenter / Spot / 自动关机 |
| **Operate** | 治理:预算 / 配额 / 流程 | 自研平台 + OKR |

### 6.2 成本治理委员会

**组织**:
- FinOps Lead(1 名,负责跨团队协调)
- 各团队 Cost Owner(每业务线 1 名)
- 云架构师 / SRE

**例会**:每月 1 次,review:
- 成本趋势(同比 / 环比)
- Top 10 成本作业 / 用户
- 已执行优化项的 ROI
- 下月优化计划

### 6.3 预算 / 告警体系

```yaml
# AWS Budgets 示例
monthly_budget:
  amount: 1500000                       # 150 万
  alerts:
  - threshold: 50%                      # 50% 告警
    emails: [finops@company.com]
  - threshold: 80%                      # 80% 告警 → PagerDuty
  - threshold: 100%                     # 100% 强制限流
    action: deny                        # 拒绝新 Spot 实例
```

### 6.4 自动回收闲置资源

```python
# 识别低利用率集群/任务
- 过去 7 天 CPU 利用率 < 10% 的集群 → 标记
- 连续 3 天 0 任务的 namespace → 通知 + 7 天后回收
- 单个作业 P99 cost > 1000/天 → 高亮给团队
```

---

## 7. 真实成本优化案例

### 7.1 案例 A:从 ¥500w/月 压到 ¥150w/月

**背景**:某中型互联网公司大数据集群,日均 30w 任务,数据 1PB。

**优化清单**:

| 优化项 | 节省 / 月 |
| --- | --- |
| Spark 作业 Dynamic Allocation(20% 资源浪费) | ¥30w |
| HDFS → 存算分离(JuiceFS) | ¥60w |
| Spot 实例覆盖批处理 50% | ¥80w |
| OSS 冷数据归档(S3 Glacier 类) | ¥40w |
| Parquet ZSTD 压缩 | ¥25w |
| Doris 冷数据 HDD | ¥15w |
| Presto 自研优化 + 缓存 | ¥20w |
| 集群关机(周末 48h 缩 0) | ¥40w |
| AI 推理 P5 GPU 共享 | ¥30w |
| **合计** | **¥340w** |

**实际**:¥500w → ¥160w,**降本 68%**。

### 7.2 案例 B:Flink 任务 Serverless 化

**背景**:某金融公司 Flink 实时任务 200+,低峰期 70% 资源闲置。

**方案**:
- 改用 **Ververica Platform** / **阿里云 Flink Ververica**;
- 低峰期自动缩 50% TaskManager;
- 突发流量自动扩容。

**节省**:¥80w/月 → ¥30w/月。

---

## 8. 实战任务

1. **本地起 Karpenter**,模拟一个 deployment 自动扩容 / 缩容。
2. **用 Spark Listener 写一个成本埋点**,推送到 Kafka。
3. **配置 OSS 生命周期规则**,让 30 天前的数据自动转 IA。
4. **比较 Snappy / ZSTD / LZ4 压缩率**,在 1GB Iceberg 数据上测试。
5. **用 Karpenter 跑一个 Spot 实例训练任务**,记录中断和恢复时间。

---

## 9. 专家面试题

1. **存算分离 vs 存算一体的本质区别?**
   *资源耦合 vs 解耦;扩容效率 + 成本优化。*

2. **Spot 实例为什么不能用于核心在线服务?**
   *可能被回收,影响 SLA。*

3. **Karpenter 比 Cluster Autoscaler 强在哪?**
   *直接调 EC2 / 阿里 ECS,30s 拉节点,无 ASG / Launch Template。*

4. **冷热分层收益最大的是什么数据?**
   *日志(写入多、查少、增长快)、备份数据。*

5. **为什么 ZSTD 比 Snappy 压缩率高但吞吐略低?**
   *ZSTD 算法更复杂(Zstd字典),压缩率 1.5–2×,吞吐 80%。*

6. **FinOps 的核心指标是什么?**
   *成本 / 单位业务价值(e.g. 100 万订单的成本)。*

7. **内部计费的挑战是什么?**
   *定价模型(资源单价 + 摊销)、数据准确性、用户接受度。*

8. **存算分离后 shuffle 怎么优化?**
   *Apache Celeborn / Remote Shuffle Service,off-heap 缓存。*

9. **Doris 冷热分层怎么配?**
   *`storage_cooldown_ttl="30 day"` + `storage_medium="SSD"`。*

10. **成本治理的最大误区?**
    *只看云厂商账单,不看业务维度(每订单 / 每用户)。*

---

## 10. 生产经验(给团队的清单)

1. **每周一次成本 review**:Top 10 作业 + Top 10 用户。
2. **任何新集群必须带自动关机脚本**。
3. **任何新作业必须有 cost 标签**(team / project / owner)。
4. **Spot 覆盖率监控**:离线任务 > 70%,在线服务 0%。
5. **存储成本季度 review**:冷数据必须归档。
6. **DR 演练成本**:备份数据 30 天后必须转 IA / Archive。
7. **GPU 必须共享**:MIG 切分 + 时间片调度。
8. **定期 deprecate 旧版本**:Spark 3.2 → 3.5,YARN → K8s。
9. **FinOps 必须是组织行为**,不是技术优化。
10. **成本是产品功能,不是后台支撑**。

---

**下一章** → [05-50K 岗位能力地图与简历模板](./05-job-50k.md)