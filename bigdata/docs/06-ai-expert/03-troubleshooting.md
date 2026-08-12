# 03 · 故障排查清单(20 个真实生产案例)

> **本章目标**:20 个真实生产故障复盘,每个案例:故障现象 → 定位 → 根因 → 修复 → 改进。
> **覆盖范围**:Kafka 积压 / Spark OOM / Flink 反压 / Hive 小文件 / K8s GPU 调度 / Doris 副本失效 / Flink CDC / Iceberg 慢读 / YARN 资源抢占 / Kafka ISR 收缩 / Spark Shuffle Fetch Failed / Doris BE OOM / Hive Metastore 卡顿 / Flink State 膨胀 / K8s PVC 满 / Spark Driver OOM / HDFS DataNode 磁盘满 / Kafka __consumer_offsets 损坏 / Flink 反压雪崩 / Doris Compaction 卡死。
> **方法论**:看现象(指标/日志) → 定位(瓶颈点) → 根因(代码/参数/数据) → 修复(短期止血) → 改进(长期治理)。

---

## 1. Kafka 消息积压(Topic 延迟 8 小时)

**故障现象**:某 Topic 凌晨开始 lag 暴涨,从 1w 涨到 8 千万,下游消费方 FLink 任务积压 8 小时。

**定位步骤**:
1. `kafka-consumer-groups.sh --describe --group flink-job` → lag 集中在 partition 5–7。
2. 看 partition 5 的 broker:`kafka-log-dirs.sh --describe --topic order-events --broker 3` → **磁盘使用 95%**。
3. `jstack <broker_pid>` → 发现 `Log Flush` 线程 blocked。

**根因**:
- Broker 3 磁盘使用 95%,page cache 命中率暴跌,写入抖动。
- 同时 `num.replica.fetchers=1` 太少,副本同步跟不上。

**修复**:
```bash
# 1) 立即清理磁盘(临时)
kafka-log-dirs.sh --delete --topic old-logs --broker 3

# 2) 扩容 broker(临时)
kubectl scale statefulset kafka --replicas=5

# 3) 调参(短期止血)
num.replica.fetchers=4
replica.fetch.min.bytes=1
replica.fetch.max.bytes=1048576
log.flush.interval.ms=10000
```

**改进**:
- **磁盘阈值告警 70%**,加 disk pressure metric;
- Log retention 从 7d → 3d;
- **Kafka tiered storage**:冷数据自动归档到 S3,释放本地磁盘;
- 引入 **Cruise Control** 自动 rebalance。

---

## 2. Spark OOM(Driver 端 collect 触发)

**故障现象**:某 Spark SQL 作业跑完 Stage 后 Driver OOM,K8s pod 重启。

**定位**:
1. Driver 报错 `java.lang.OutOfMemoryError: Java heap space`。
2. 看 SQL:`SELECT user_id, collect_list(item_id) FROM ... GROUP BY user_id`,某 VIP 用户有 200w+ item。
3. `spark.driver.maxResultSize=1g` 默认,实际 collect 到 driver 50GB+。

**根因**:大 key + `collect_list` 把结果集全部拉到 driver。

**修复**:
- 改 SQL:`collect_list` → 不 collect,直接写外部存储;
- 或开 `spark.sql.execution.arrow.pyspark.enabled=true` 用 Arrow 加速;
- 或 `collect_list` 前加 `limit`。

**改进**:
- 任何聚合后 collect 到 driver 必须**审计**,写 `audit.log`;
- 设置 `spark.driver.maxResultSize=2g` 硬限;
- 大结果集走 Iceberg / Doris 写表,不 collect。

---

## 3. Flink 反压(雪崩式)

**故障现象**:实时任务延迟从 5s 涨到 2min,Flink WebUI 整条链路反压。

**定位**:
1. WebUI 看反压:Source Kafka 端红 → Map 绿 → Sink Doris 端红。
2. 反向定位 Sink,看 Doris BE 日志:`stream load` RPC 超时。
3. `Doris Audit`:单次 stream load 写入 100k+ 行,但 80% 失败重试。

**根因**:
- Doris FE 端 `max_stream_load_timeout_ms=600` 太长,大批量写失败重试阻塞;
- 同时 30 个并发 stream load,Doris FE 进程 CPU 100%。

**修复**:
```java
// 1) Flink 端降并发
sink.setBatchSize(2000);                    // 2000 → 5000
sink.setFlushInterval(2000);                // 2s

// 2) Doris 端
ADMIN SET FRONTEND CONFIG ("max_stream_load_timeout_ms" = "300");
ADMIN SET FRONTEND CONFIG ("parallel_fragment_exec_instance_num" = "8");

// 3) 临时降流量
```

**改进**:
- 实时任务必须有**反压监控告警**(延迟 > 60s);
- Doris FE 必须 HA(多副本),不能单点;
- Flink 任务分等级,核心任务独立 Doris FE 集群。

---

## 4. Hive 小文件爆炸

**故障现象**:Hive 表 100w 个文件,平均 5KB,查询 T+1 报表 30min。

**定位**:
1. `hdfs dfs -count -q /warehouse/ods/...` → 文件数 1.2M,平均 8KB。
2. Map 数 = 文件数 = 1.2M,集群被吃光,每个 Map 处理 8KB。
3. NameNode RPC 队列堵塞。

**根因**:每天 100+ 任务 insert,每条数据落一个文件,小文件雪崩。

**修复**:
```sql
-- 紧急合并
SET hive.merge.mapfiles = true;
SET hive.merge.size.per.task = 256000000;     -- 256MB
SET hive.merge.smallfiles.avgsize = 64000000; -- 平均 64MB 触发合并
ALTER TABLE ods.x CONCATENATE;
```

或用 **Iceberg / Hudi 替代 Hive**(自带小文件合并)。

**改进**:
- 写入端 `spark.sql.files.maxRecordsPerFile=1000000`,每个文件至少 1MB;
- 用 Iceberg `write.target-file-size-bytes=134217728`(128MB);
- NameNode RPC 监控:`AvgRPCLatency > 200ms` 告警。

---

## 5. K8s GPU 调度失败(集群 50% 空闲但任务起不来)

**故障现象**:用户提交 8 卡 GPU 推理任务,`kubectl describe pod` 显示 Pending,5 分钟后 `Insufficient nvidia.com/gpu`。

**定位**:
1. `kubectl get nodes -o json | jq '.items[].status.allocatable'` → 节点有 16 卡。
2. 集群实际空闲 12 卡,但 Pod 永远 Pending。
3. 翻 scheduler 日志:`cannot schedule: gang-scheduling: only 4 GPUs available in same network topology`。

**根因**:Volcano gang scheduling 要求 8 卡**同 Leaf 交换机**且**同 MIG 池**,集群拓扑配置错误,实际同 Leaf 下只有 4 卡。

**修复**:
```yaml
# 方案 1: 改 task spec 容忍跨 Leaf
plugin: gang
gang:
  minAvailable: 8
  schedulingPolicy: default
# 实际是拓扑配置问题,改 cluster.conf
```

**改进**:
- K8s 上 GPU 拓扑必须用 **TopologyKey**(`topologyKey: nvidia.com/gpu-topology`);
- 集群初期规划 RDMA / NVLink 网络,避免拓扑碎片;
- 任务配额按 GPU 拓扑分组,告警「拓扑可用 < 任务需求」。

---

## 6. Doris 副本失效(Tablet REPAIR 长期不恢复)

**故障现象**:某 Tablet 副本数 3 → 2,持续 REPAIR 2 小时未恢复。

**定位**:
1. `show tablet 12345` → `data_完整性 0.85`,副本状态 `REPLICA_REPLICA_ERROR`。
2. `be.INFO` → `version=2100, missing rowsets=5`。
3. 找到 missing rowsets 对应的 BE 节点,磁盘 95% 满,数据无法写入。

**根因**:BE 节点磁盘满,Compaction / Clone 写入失败。

**修复**:
```bash
# 1) 紧急清理
ssh be-3 rm -rf /data/doris/storage/old_garbage/

# 2) 手动补副本
ADMIN SET REPLICA STATUS PROPERTIES("tablet_id" = "12345", "status" = "NORMAL");
ADMIN REPAIR TABLE dwd.dwd_order;

# 3) 加节点
ALTER SYSTEM ADD BACKEND "be-4:9050";
```

**改进**:
- BE 磁盘阈值告警 70%,`storage_flood_stage_usage_percent=85`;
- BE `storage_disable_occupy=true`,空闲磁盘不够时禁止写入;
- **自动补副本**(Decommission + Add Backend 流程)。

---

## 7. Flink CDC 启动慢(30 分钟才追上)

**故障现象**:Flink CDC MySQL → Kafka 任务启动后 30 分钟还在 snapshot 阶段。

**定位**:
1. 看 CDC 日志:`Snapshotting table xxx, rows=2.3e8, ETA 25min`。
2. snapshot 阶段是单并发全表 select,2.3 亿行 ~ 25min。
3. checkpoint 配置 1 分钟,每次都等 snapshot。

**根因**:
- CDC snapshot 阶段无并发;
- 锁表(可重复读事务)阻塞业务写入。

**修复**:
```java
// 1) 关闭全量 snapshot,改用增量
MySqlSource.builder()
    .serverId(...)
    .debeziumProperties(props)
    .scanNewlyAddedTableEnabled(true)
    .build();

// 2) 分片 snapshot
table.SCAN.INCREMENTAL.SNAPSHOT.CHUNK.KEY.COLUMN=id
table.SCAN.INCREMENTAL.SNAPSHOT.CHUNK.SIZE=8192

// 3) 调并行
.setParallelism(8)
```

**改进**:
- 大表 CDC 必须**先 snapshot 到 Iceberg** 再接增量;
- CDC 任务分库并行,避免单库瓶颈;
- binlog 必须 `binlog_row_image=FULL`。

---

## 8. Iceberg 慢读(Query 5min → 30s)

**故障现象**:Iceberg 表 `SELECT * FROM t WHERE dt = '2026-08-11'`,5 亿行,5 分钟。

**定位**:
1. `EXPLAIN` → `Partition Pruning` 已生效,扫 200 文件。
2. 但每个文件都做列扫描,无 min/max 过滤。
3. Parquet `footer` 有 row group stats,Spark 没读。

**根因**:
- 写入时未配 `sort.order`,row group 完全无序;
- Spark 配 `spark.sql.iceberg.vectorization.enabled=false`(默认!),向量化读未开。

**修复**:
```conf
spark.sql.iceberg.vectorization.enabled=true
spark.sql.iceberg.vectorization.batch-size=5000
```

写入端优化:
```sql
-- 按 dt + id 排序写,row group 统计有效
CALL system.rewrite_data_files(
    table => 'db.t',
    sort_order => 'zorder(id,user_id)'
);
```

**改进**:
- 所有 Iceberg 表写入必须配 `sort.order`;
- Vectorized read 必开;
- 定期 `rewrite_data_files` 整理小文件 + 排序。

---

## 9. YARN 资源抢占(NM 假死)

**故障现象**:YARN 集群提交任务一直 ACCEPTED 不 RUNNING。

**定位**:
1. `yarn rmadmin -getServiceState rm1` → 正常。
2. `yarn node -list -states LOST` → 30% NM 失联。
3. 看 NM 日志:`Received SIGTERM` / `java.io.IOException: Broken pipe`。

**根因**:
- NM 进程内存超 OOM kill(内存泄漏);
- RM 检测心跳超时,标 LOST。

**修复**:
```bash
# 1) 重启 NM
yarn-daemon.sh stop nodemanager
yarn-daemon.sh start nodemanager

# 2) 加内存
export YARN_NODEMANAGER_OPTS="-Xmx8g -Xms8g"

# 3) 调超时
yarn.resourcemanager.nm.liveness-monitor.interval-ms=60000
yarn.nodemanager.health-checker.interval-ms=60000
```

**改进**:
- YARN 监控告警:NM LOST > 5% 触发;
- **改用 K8s 调度**,无 NM 单点;
- JVM 参数 + 堆外监控。

---

## 10. Kafka ISR 收缩到 1

**故障现象**:某 Topic partition 3 副本 ISR 只有 1(原本 3)。

**定位**:
1. `kafka-topics.sh --describe --topic orders` → `ISR=[2], Replicas=[1,2,3]`。
2. 看 broker 1 和 3 日志:`replica.lag.max.messages=4000` 超限。
3. 集群带宽 100% 满,follower 同步延迟。

**根因**:
- 集群带宽打满,follower 同步延迟 > `replica.lag.time.max.ms=30000`;
- broker 1 / 3 被踢出 ISR。

**修复**:
```conf
# 短期:放宽阈值
replica.lag.time.max.ms=60000
replica.lag.max.messages=10000

# 中期:扩 broker
```

**改进**:
- ISR 监控:`kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions > 0` 告警;
- **网络监控**:`node_network_transmit_queue` > 1000 告警;
- 关键 Topic 用 `min.insync.replicas=2`。

---

## 11. Spark Shuffle Fetch Failed

**故障现象**:Spark 任务跑到 80% 报 `ShuffleBlockFetcherIterator: Failed to get block`。

**定位**:
1. Executor 日志:`Connection refused`,远端 NM 失联;
2. YARN:`yarn node -list -states LOST` → 3 个 NM LOST;
3. 数据落在已 LOST 的 NM 的 shuffle 服务上。

**根因**:长任务跑(4h),中间部分 NM OOM 被杀,shuffle 文件丢失。

**修复**:
```bash
# 短期:重跑
spark-submit --conf spark.yarn.maxAppAttempts=3 ...

# 参数:开 speculation
spark.speculation=true
spark.speculation.multiplier=1.5
```

**改进**:
- 启用 **External Shuffle Service**(`spark.shuffle.service.enabled=true`);
- 升级到 **Apache Celeborn**,Shuffle 不依赖 NM 本地盘;
- 任务增加 `yarn.nodemanager.resource.memory-mb` + `yarn.nodemanager.vmem-pmem-ratio` 调大。

---

## 12. Doris BE OOM Killed

**故障现象**:某 Doris 集群每天 OOM killed 1–2 次,都是某个分析师跑大查询。

**定位**:
1. `dmesg | grep -i oom` → `Out of memory: Killed process 12345 (doris_be)`。
2. Doris BE `INFO`:`Process memory usage 95%`,query 内存 50GB。
3. 查询 `EXPLAIN` 显示大 JOIN 生成 hash table 70GB。

**根因**:
- 大查询无 limit,build hash table 占满内存;
- 没有 query memory quota 限制。

**修复**:
```sql
-- 限制单查询内存
SET GLOBAL query_mem_limit = 32 * 1024 * 1024 * 1024;  -- 32GB
```

**改进**:
- Doris 加 query resource group,按用户/业务分配内存;
- 大屏全部走物化视图,禁止明细直查;
- Doris BE 监控:`Memory used > 80%` 告警;
- 升级到 2.x 新内存模型,自动 spill。

---

## 13. Hive Metastore 卡死

**故障现象**:所有 Hive / Spark 任务启动慢 5 分钟,Hive Metastore RPC 排队。

**定位**:
1. Metastore 日志:`Slow query: 30s`,`Database lock contention`。
2. `show locks` → 1000+ 锁等待。
3. 某 ETL 任务升级锁没释放。

**根因**:长时间持有 HMS 锁,阻塞其他任务。

**修复**:
```bash
# 1) 杀掉问题 session
beeline -u jdbc:hive2:// -e "SHOW PROCESSLIST; KILL <id>;"

# 2) 加超时
hive-site.xml:
hive.txn.timeout=600
hive.compactor.initiator.on=true
hive.compactor.worker.threads=2
```

**改进**:
- **改用 Iceberg/Hudi**,无 HMS 锁;
- Metastore 监控:`HMSTxnLockWaitTime > 30s` 告警;
- 长事务任务加 `SET hive.txn.timeout=600`。

---

## 14. Flink State 膨胀(OOM Checkpoint)

**故障现象**:Flink 任务 state 从 5GB 涨到 200GB,Checkpoint 失败。

**定位**:
1. WebUI → State Backend → RocksDB:100GB。
2. `jmap` 看 Flink TaskManager 堆,只占 8GB,堆外 95GB。
3. 看业务:`MapFunction` 用 `ValueState<List<T>>` 无限累加。

**根因**:
- 业务代码 bug,List 无界增长;
- 没配 State TTL。

**修复**:
```java
// 加 TTL
StateTtlConfig ttl = StateTtlConfig.newBuilder(Time.days(7))
    .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)
    .cleanupFullSnapshot()
    .build();
stateDescriptor.enableTimeToLive(ttl);
```

**改进**:
- 所有 state 必须配 TTL;
- State size 监控告警:`flink_taskmanager_job_task_operator_state_size > 10GB`;
- 定期 savepoint 清理。

---

## 15. K8s PVC 满(Pod Evicted)

**故障现象**:Flink TM Pod 频繁 Evicted,`kubectl describe pod` 显示 `DiskPressure`。

**定位**:
1. `df -h` → `/data` 100% 满。
2. Flink TM 日志:`RocksDB: No space left on device`。
3. RocksDB state 文件 50GB,checkpoint 没清理。

**根因**:
- Flink checkpoint 保留过多,旧的 state 文件未删;
- PVC 100GB 不够。

**修复**:
```yaml
# 1) 清 checkpoint
kubectl exec -it tm-xxx -- rm -rf /data/flink/checkpoints/old/*

# 2) Flink 配置
state.checkpoints.num-retained=2
state.backend.incremental=true

# 3) 扩 PVC
kubectl edit pvc flink-data --type=merge -p '{"spec":{"resources":{"requests":{"storage":"500Gi"}}}}'
```

**改进**:
- Flink PVC 监控:`kubelet_volume_stats_available_bytes / capacity < 30%` 告警;
- 配置 StorageClass 自动扩容;
- State Backend 用对象存储(S3 / OSS),不依赖本地盘。

---

## 16. Spark Driver OOM(spark-shell 内存溢出)

**故障现象**:`spark.sql(...)` 在 spark-shell 跑,Driver 端 OOM。

**定位**:
1. Driver 报错 `OutOfMemoryError`,日志显示 `collect` 阶段。
2. SQL 含 `collect_list` 聚合,某 key 200w 行。
3. `spark.driver.memory=4g`,实际聚合结果 30GB。

**根因**:`collect` 把所有结果拉到 driver,Driver 内存不够。

**修复**:
```python
# 1) 改写:不 collect
df.write.parquet("hdfs://...")

# 2) 增加 Driver 内存
spark-submit --driver-memory 16g

# 3) 加 limit(最后兜底)
df.limit(1000).show()
```

**改进**:
- 生产禁止在 spark-shell 跑大数据集;
- 任何 collect / show / count 必须加 limit;
- Driver 端加 `spark.driver.maxResultSize=2g`。

---

## 17. HDFS DataNode 磁盘满

**故障现象**:HDFS 写文件失败,`No space left on device`。

**定位**:
1. `hdfs dfsadmin -report` → 多个 DN 100%。
2. DN 日志:`Cannot allocate new block`。
3. 临时文件未清理(`/tmp` 100GB)。

**根因**:
- Yarn NM 本地目录 `/tmp/yarn` 占 50GB;
- 用户 spark-submit 写到 HDFS 根。

**修复**:
```bash
# 1) 清临时
rm -rf /tmp/yarn/*

# 2) 配 HDFS 配额
hdfs dfsadmin -setSpaceQuota 10t /user/spark

# 3) DN 磁盘配多目录
dfs.datanode.data.dir=/data1,/data2,/data3
```

**改进**:
- DN 磁盘阈值 70% 告警;
- **多 DN 多盘**分担;
- HDFS balancer 每周一次;
- 改用对象存储(S3/OSS)替代 HDFS。

---

## 18. Kafka `__consumer_offsets` 损坏

**故障现象**:Kafka 集群重启后,所有消费组无法提交 offset,重复消费。

**定位**:
1. Kafka 日志:`OffsetCommit failed: GroupCoordinatorNotAvailable`。
2. `__consumer_offsets` 副本全部 LOST。
3. `kafka-log-dirs.sh --describe --topic __consumer_offsets` → 损坏。

**根因**:
- 集群 3 broker,`offsets.topic.replication.factor=3`,但实际部署只 1 broker 时创建过;
- broker 重启后 corrupt。

**修复**:
```bash
# 1) 临时
kafka-configs.sh --alter --zookeeper zk:2181 --entity-type topics --entity-name __consumer_offsets --add-config 'cleanup.policy=compact'
kafka-reassign-partitions.sh --zookeeper zk:2181 --reassignment-json-file reassign.json --execute

# 2) 重建 offsets topic
kafka-configs.sh --alter --entity-type brokers --entity-default --add-config 'offsets.topic.replication.factor=3'
```

**改进**:
- 部署时 `offsets.topic.replication.factor=3` 必须**全 broker 启动后**;
- 监控 `UnderReplicatedPartitions` 告警;
- 定期 `kafka-consumer-groups.sh --describe` 验证 group 健康。

---

## 19. Flink 反压雪崩(整条链路从 10s 涨到 30min)

**故障现象**:实时任务延迟从 10s 涨到 30min,WebUI 全部反压。

**定位**:
1. 反压从 Sink 传到 Source。
2. Sink = Doris,查 `doris_be.INFO`:`stream load RPC 超时`,**FE 卡死**。
3. FE `Audit` 显示 FE QPS 10000,GC 严重。

**根因**:上游突发流量 10x,Sink 跟不上,反压沿数据流反向传到 Source。

**修复**:
```java
// 1) 限流(短期)
env.setParallelism(32);              // 加并发
sink.setBatchSize(1000);             // 降 batch
sink.setFlushInterval(500);          // 降间隔

// 2) Doris 端
ADMIN SET FRONTEND CONFIG ("qe_max_concurrent_query = 100");

// 3) 临时降流量
```

**改进**:
- Flink 任务必须**配反压监控** + 自动告警;
- Sink 必须有 **自适应 batch**(`adaptive_batching`);
- 关键任务独立 FE / BE 集群;
- 流量预估 + 自动扩容。

---

## 20. Doris Compaction 卡死

**故障现象**:Doris 集群大量 `BaseCompaction` 任务超时,version 数爆炸。

**定位**:
1. `SHOW PROC '/compaction'` → 200 个 compaction 任务,80% PENDING。
2. `be.INFO`:`compaction_score=200`,`max_compaction_score=100` 告警。
3. 单 tablet 数据 50GB,version 数 5000+。

**根因**:
- 写入速度过快,compaction 跟不上;
- 单 tablet 数据过大。

**修复**:
```sql
-- 1) 手动触发(慎用)
ADMIN COMPACT TABLE dwd.dwd_order;

-- 2) 增加 compaction 并发
ADMIN SET FRONTEND CONFIG ("max_base_compaction_concurrency" = "8");
ADMIN SET FRONTEND CONFIG ("max_cumulative_compaction_concurrency" = "20");

-- 3) 调小 cumulative 阈值
ADMIN SET FRONTEND CONFIG ("cumulative_compaction_num_deltas_per_round" = "3");
```

**改进**:
- 写入端用 **攒批**(`group_commit_interval_ms=100`);
- Tablet 数据量 < 10GB;
- 监控 `compaction_score > 50` 告警;
- 启用**vertical compaction**(`enable_vertical_compaction=true`)。

---

## 21. 故障排查通用 SOP

### 6.1 五步排查法

```
1) 看现象 (Dashboard / Alert / 监控)
        ↓
2) 找瓶颈 (Spark UI / Flink WebUI / Grafana / Audit)
        ↓
3) 查根因 (JVM / OS / Network / Code)
        ↓
4) 短期修复 (限流 / 重启 / 扩容)
        ↓
5) 长期改进 (参数 / 架构 / 监控)
```

### 6.2 必装工具

```bash
# JVM 分析
arthas, async-profiler, jvisualvm, MAT

# 网络
tcpdump, netstat, ss, iperf3

# 磁盘
iotop, iostat, dstat

# 内存
free, vmstat, /proc/meminfo

# K8s
kubectl, crictl, kubetail, prometheus

# 大数据专用
Spark UI, Flink WebUI, Doris Audit, Kafka Eagle, Iceberg REST
```

### 6.3 必看的日志位置

| 组件 | 关键日志 |
| --- | --- |
| Spark | `driver.log`, `executor stdout/stderr` |
| Flink | `flink-standalonesession.log`, `taskmanager.log` |
| Kafka | `server.log`, `controller.log`, `kafka-request.log` |
| Doris | `fe.audit.log`, `be.INFO`, `be.WARNING` |
| Iceberg | `iceberg-rest.log`, Spark/Flink log |
| YARN | `yarn-resourcemanager.log`, `yarn-nodemanager.log` |
| K8s | `kubectl logs`, `kubectl describe` |

---

## 7. 实战任务

1. **本地起 Kafka + Spark Streaming + Doris**,模拟 Doris 端反压,定位修复。
2. **构造 Iceberg 1 亿行小文件**,观察 vectorized read 前后差异。
3. **触发一次 Flink CDC snapshot**,记录时长和瓶颈。
4. **人为制造一次 RocksDB state 膨胀**,加 TTL 修复。
5. **压测 Doris 大查询**,触发 `query_mem_limit` 熔断。

---

## 8. 专家面试题

1. **Kafka 消息积压的根因和解决?**
   *磁盘满 / 消费者慢 / 分区不均;短期扩 broker + 调参,长期限流 + 多 topic。*

2. **Spark OOM 的常见原因?**
   *Driver: collect 大结果集;Executor: 数据倾斜 + 内存不足;堆外: shuffle buffer。*

3. **Flink 反压如何定位?**
   *WebUI 反压颜色 + Metrics(网络 buffer 使用率 + inPoolUsage);从 Sink 反向找。*

4. **Hive 小文件怎么治?**
   *写入端控制大小(`maxRecordsPerFile`) + CONCATENATE + 改用 Iceberg。*

5. **K8s GPU 调度为什么 Gang Scheduling?**
   *分布式训练需要所有 Pod 同时就绪,否则 NCCL 死锁。*

6. **Doris 副本失效怎么办?**
   *磁盘满 → 清理 / 加节点;Tablet 损坏 → ADMIN REPAIR;长期:副本均衡 + 监控。*

7. **Flink CDC 启动慢的优化?**
   *并行 snapshot + chunk size + 关闭全量 snapshot 改增量。*

8. **Iceberg 慢读的优化?**
   *vectorized read + sort order + rewrite data files。*

9. **YARN NM 假死怎么办?**
   *重启 + 加大内存 + 改 K8s 调度。*

10. **Kafka ISR 收缩的根因?**
    *follower 同步延迟 > 阈值;扩 broker + 放宽阈值 + 监控告警。*

---

## 9. 生产经验(必背)

1. **任何故障先恢复再追责**:短期止血比找到根因更重要。
2. **所有集群必须有健康检查 Dashboard**:5 分钟内能看出问题。
3. **故障时间线记录**:从告警到恢复,每步 5 分钟内记录。
4. **Post-Mortem 必须 24 小时内写**:复盘 + Action Items。
5. **定期故障演练**:季度一次混沌工程。
6. **不要依赖单 broker / 单 NM / 单 FE**:生产必须 HA。
7. **磁盘 70% / 内存 80% 必告警**:不可用是不可恢复的。
8. **大查询必须有 query_mem_limit**:防止单查询打死集群。
9. **小文件监控 + 自动合并**:Hive / Iceberg 都必须。
10. **监控 / 日志 / 告警三件套缺一不可**。

---

**下一章** → [04-成本治理](./04-cost-optimization.md)