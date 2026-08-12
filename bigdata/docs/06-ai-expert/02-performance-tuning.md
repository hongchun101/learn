# 02 · 性能调优三板斧(Tier / JVM / OS / Shuffle / IO)

> **本章目标**:掌握 Spark 28 招 / Flink 18 招 / Doris 调优清单,定位一次性能瓶颈到具体源码行。
>
> **方法论**:性能调优的"三板斧"——
> 1. **Tune Tier**:JVM GC / 内存模型 / 网络 / 磁盘
> 2. **Tune Engine**:Spark/Flink 参数、Shuffle、Join、并行度
> 3. **Tune SQL / Job**:数据倾斜、Schema、IO 模式
>
> **记忆口诀**:先看 Tier(资源是否够),再看 Engine(参数是否对),最后看 Job(逻辑是否糙)。

---

## 0. 调优三板斧总览

```
┌─────────────────────────────────────────────────────────────┐
│ Tier 层: 资源够不够?                                          │
│  - CPU / 内存 / 磁盘 / 网络 / GPU                              │
│  - JVM GC 参数 / 堆外内存 / DirectMemory                     │
│  - OS 内核参数 / cgroup / NUMA 绑定                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ Engine 层: 参数对不对?                                        │
│  - Spark: shuffle / serializer / spill / broadcast / AQE     │
│  - Flink: checkpoint / backpressure / state / watermark      │
│  - Doris: bucket / partition / tablet / compaction           │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ Job 层: 逻辑糙不糙?                                            │
│  - 数据倾斜(skew join / hot key)                              │
│  - 重复计算(多次 broadcast / 多次 scan)                       │
│  - IO 模式(顺序读 / 随机读 / 小文件)                         │
└─────────────────────────────────────────────────────────────┘
```

**调优铁律**:
1. **先 Profile,再调参**:`async-profiler` / `Spark UI` / `Flink WebUI` / `Doris Audit`。
2. **改一处测一处**:禁止一次改 5 个参数然后"看起来快了"。
3. **量化指标**:缩短 X 分钟 / 提升 X% / 省 X 资源。

---

## 1. Tier 层调优(★ 通用基础)

### 1.1 JVM 参数(★ 重要)

**生产 JVM 推荐(OpenJDK 17,G1GC 为默认)**:

```bash
# 通用参数
-Xms16g -Xmx16g                          # 堆大小,建议等于物理内存 50–75%
-XX:+UseG1GC                              # 默认
-XX:MaxGCPauseMillis=200                  # 暂停目标 200ms
-XX:+UseStringDeduplication                # String 去重,Spark 大字符串受益
-XX:+UnlockExperimentalVMOptions
-XX:G1NewSizePercent=30                   # 新生代 30%
-XX:G1MaxNewSizePercent=40
-XX:InitiatingHeapOccupancyPercent=45     # 触发并发标记阈值
-XX:ConcGCThreads=4
-XX:ParallelGCThreads=16
-XX:+ParallelRefProcEnabled
-XX:-ResizePLAB

# 堆外 / 直接内存(Netty / Spark Shuffle)
-XX:MaxDirectMemorySize=8g                # 必须 < 物理内存 - JVM 堆

# OOM 时 dump
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/tmp/heapdump.hprof
-XX:+ExitOnOutOfMemoryError                # Spark 必须,失败即 fail-fast
-XX:+CrashOnOutOfMemoryError              # JDK 17,直接 SIGABRT 更彻底

# 压缩指针
-XX:+UseCompressedOops                     # 堆 < 32GB 自动开启
-XX:+UseCompressedClassPointers            # JDK 17 默认

# 大页(HugePage,慎用)
-XX:+UseLargePages                        # 需要 OS 配 hugetlbfs
```

### 1.2 JVM 调优的几个核心

#### (1) G1 vs ZGC vs Shenandoah

| GC | 暂停 | 吞吐 | 适用 |
| --- | --- | --- | --- |
| **G1** | < 200ms | 高 | 通用,默认 |
| **ZGC** | < 1ms | 中 | 大堆(> 32GB)、低延迟 |
| **Shenandoah** | < 1ms | 中 | 同 ZGC,RedHat 主推 |
| **Parallel** | 1–10s | 最高 | 离线批处理 |

**Spark / Flink 生产推荐**:G1(稳)或 ZGC(对低延迟要求高)。

#### (2) 大对象分配

Spark 中 `object` 序列化对象如果 > 512KB,**直接进老年代,频繁触发 Full GC**。
- 改用 **Kyro 序列化**(`spark.serializer=org.apache.spark.serializer.KryoSerializer`);
- 单行数据 > 10MB 要考虑列存 / 分片。

#### (3) 堆外内存

Netty / Spark Shuffle / Flink Network 都用堆外:
```bash
-XX:MaxDirectMemorySize=8g
spark.shuffle.file.buffer=64k → 1m
```

#### (4) String 去重

`-XX:+UseStringDeduplication`,Spark SQL 中大量重复字符串时收益 20%+ 堆占用。

### 1.3 操作系统参数

```bash
# /etc/sysctl.conf
vm.swappiness=10                           # 降低 swap 倾向(0=禁用,生产建议 10)
vm.overcommit_memory=1                     # 允许超分配
vm.dirty_background_ratio=5                # 后台 flush 阈值
vm.dirty_ratio=10
vm.zone_reclaim_mode=0                     # 关闭 NUMA 跨区回收

# 网络
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=65535
net.core.netdev_max_backlog=65535
net.ipv4.tcp_tw_reuse=1
net.ipv4.tcp_fin_timeout=15
net.ipv4.tcp_slow_start_after_idle=0      # 关闭空闲慢启动,长连接友好
net.ipv4.tcp_rmem=4096 87380 16777216
net.ipv4.tcp_wmem=4096 65536 16777216

# 文件 / IO
fs.file-max=2097152
fs.nr_open=1048576
fs.aio-max-nr=1048576                      # 异步 IO(块存储必备)
```

### 1.4 磁盘 IO 调优

| 场景 | 推荐 |
| --- | --- |
| Spark Shuffle | **NVMe SSD**(200k IOPS),每节点 1–2 块 |
| HDFS DataNode | 12 块 SATA SSD JBOD,关闭 RAID |
| Flink State Backend | **RocksDB on NVMe SSD** |
| Doris BE 存储 | NVMe SSD,每天 compaction |

**Block size 优化**:
- HDFS:128MB(默认)
- Kafka log segment:1GB
- Iceberg:128MB–256MB

### 1.5 NUMA 绑核

```bash
numactl --cpunodebind=0 --membind=0 java -jar ...
```

JVM 启动时:
```bash
-XX:+UseNUMA
```

---

## 2. Spark 调优 28 招

### 2.1 基础配置(招 1–8)

| # | 参数 | 默认 | 推荐 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `spark.executor.instances` | – | **动态** | 按负载,K8s 上用 Dynamic Allocation |
| 2 | `spark.executor.cores` | 1 | 4–5 | 单核 > 5 时 HDFS 吞吐下降 |
| 3 | `spark.executor.memory` | 1g | 16–32g | **超 32g GC 变差** |
| 4 | `spark.executor.memoryOverhead` | 10% | 15–25% | 堆外 + JVM overhead,YARN 必备 |
| 5 | `spark.driver.memory` | 1g | 8–16g | collect() 大结果集时调大 |
| 6 | `spark.serializer` | Java | **Kryo** | 必备 |
| 7 | `spark.sql.adaptive.enabled` | false | **true** | AQE,Spark 3.x 必开 |
| 8 | `spark.dynamicAllocation.enabled` | false | **true** | 配合 `min/maxExecutors` |

### 2.2 Shuffle 调优(招 9–16)

| # | 参数 | 默认 | 推荐 | 说明 |
| --- | --- | --- | --- | --- |
| 9 | `spark.sql.shuffle.partitions` | 200 | **按数据量**:1TB ≈ 2000–4000 | Spark 3.x AQE 自动 |
| 10 | `spark.shuffle.file.buffer` | 32k | 64k–1m | 减少 spill |
| 11 | `spark.reducer.maxSizeInFlight` | 48m | 96m–256m | reduce 拉取批次 |
| 12 | `spark.shuffle.compress` | true | true | 压缩后 IO 减半 |
| 13 | `spark.shuffle.spill.compress` | true | true | spill 压缩 |
| 14 | `spark.sql.adaptive.skewJoin.enabled` | false | **true** | 倾斜自动处理 |
| 15 | `spark.sql.adaptive.coalescePartitions.enabled` | false | **true** | 小分区合并 |
| 16 | `spark.sql.adaptive.localShuffleReader.enabled` | false | **true** | 本地化 shuffle |

**Spark 3.5 推荐的 Shuffle Manager**:`spark.shuffle.manager=org.apache.spark.shuffle.sort.SortShuffleManager`(默认)。

Spark 3.5+ 可用 **Rss(Remote Shuffle Service)** 如 Apache Celeborn(原 Celeborn),把 Shuffle 数据 off-heap + 远程存储,避免 fetch 失败重试:

```conf
spark.shuffle.manager=org.apache.spark.shuffle.sort.SortShuffleManager
spark.shuffle.service.enabled=false       # 用 Celeborn
spark.celeborn.master.endpoints=celeborn-master:9097
spark.celeborn.client.fetch.executorPort=0
```

### 2.3 Join 调优(招 17–20)

| # | 策略 | 适用 | 收益 |
| --- | --- | --- | --- |
| 17 | **BroadcastHashJoin** | 小表 < 10MB(或 < `spark.sql.autoBroadcastJoinThreshold`) | 避免 shuffle |
| 18 | **SortMergeJoin** | 大表 + 大表 | 默认,但要调分区 |
| 19 | **ShuffleHashJoin** | 中等表 < `spark.sql.autoBroadcastJoinThreshold` 但 > 10MB | 选 shuffle-hash |
| 20 | **Bucketed Join** | 多次 join 同一张大表 | 永久避免 shuffle |

**强制广播**:`/*+ BROADCAST(small_table) */` 或 `spark.sql.autoBroadcastJoinThreshold=104857600`(100MB)。

### 2.4 数据倾斜(招 21–24,★ 核心)

#### 招 21:AQE 自动倾斜处理

```conf
spark.sql.adaptive.skewJoin.enabled=true
spark.sql.adaptive.skewJoin.skewedPartitionFactor=5     # 大于中位数 5 倍
spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256mb
```

#### 招 22:盐值打散(Salting)

```scala
// 加盐
val salted = large.withColumn("salt", (rand() * 100).cast("int"))
val exploded = small.withColumn("salt", explode(array((0 until 100).map(lit(_)): _*)))
val joined = salted.join(exploded, Seq("key", "salt"))
val result = joined.drop("salt").groupBy("key").agg(...)
```

#### 招 23:过滤热 key 后单独处理

```scala
val hotKeys = Seq("hot_user_1", "hot_user_2")
val hotDF = large.filter(col("user_id").isin(hotKeys.mkString(",")))
val normalDF = large.filter(!col("user_id").isin(hotKeys.mkString(",")))
// hotDF 单独处理(unionByName + groupBy)
val hotResult = hotDF.groupBy("user_id", "key").agg(...).groupBy("user_id").agg(...)
val normalResult = normalDF.join(broadcast(small), "key").groupBy("user_id").agg(...)
val result = hotResult.unionByName(normalResult)
```

#### 招 24:两阶段聚合(局部 + 全局)

```scala
val stage1 = df.groupBy("user_id", "key").agg(sum("value").as("s"))
val stage2 = stage1.groupBy("user_id").agg(sum("s").as("total"))
```

### 2.5 IO / 数据源(招 25–28)

| # | 参数 / 技巧 | 推荐 | 说明 |
| --- | --- | --- | --- |
| 25 | `spark.sql.parquet.enableVectorizedReader` | **true** | Parquet 向量化读 |
| 26 | `spark.sql.parquet.columnarReaderBatchSize` | 4096 | 列读批大小 |
| 27 | `spark.sql.orc.enableVectorizedReader` | **true** | ORC 同 |
| 28 | Iceberg `read.split.open-file-cost` | 4194304 | 文件开消,小文件合并阈值 |

**Iceberg 读取小文件合并**:
```sql
SELECT * FROM iceberg.db.table
WHERE dt = '2026-08-11'
-- 配 Spark session:
-- spark.sql.iceberg.planning.preserve-data-sample=true
-- spark.sql.iceberg.planning.snapshot-id-inheritance=false
```

---

## 3. Flink 调优 18 招

### 3.1 基础资源(招 1–4)

| # | 参数 | 推荐 | 说明 |
| --- | --- | --- | --- |
| 1 | `taskmanager.heap.size` | 16–32g | 不超过物理 75% |
| 2 | `taskmanager.numberOfTaskSlots` | = CPU 核数 / 2 | 留一半给 Netty / 网络 |
| 3 | `taskmanager.memory.process.off-heap.size` | 8g | RocksDB state |
| 4 | `parallelism.default` | = TaskManager × slots | 一个 slot 一个并发 |

### 3.2 Checkpoint(招 5–8)

| # | 参数 | 推荐 |
| --- | --- | --- |
| 5 | `execution.checkpointing.interval` | 60s(根据业务) |
| 6 | `execution.checkpointing.min-pause` | 30s(避免连续 checkpoint) |
| 7 | `execution.checkpointing.timeout` | 600s(10 分钟) |
| 8 | `execution.checkpointing.max-concurrent-checkpoints` | 1 |

**RocksDB State Backend**(生产必选):
```conf
state.backend=rocksdb
state.backend.incremental=true                    # 增量 checkpoint,大状态必开
state.backend.rocksdb.localdir=/data/rocksdb
state.checkpoints.dir=hdfs:///flink/checkpoints

# RocksDB 调优
state.backend.rocksdb.memory.managed=true
state.backend.rocksdb.memory.write-buffer-size=64mb
state.backend.rocksdb.memory.high-priority-pool-ratio=0.3
state.backend.rocksdb.block.cache-size=128mb
```

### 3.3 序列化(招 9–10)

| # | 项 | 推荐 |
| --- | --- | --- |
| 9 | `Pipeline serializer` | **Kyro**(TypeInformation → Kryo) |
| 10 | POJO 必须有无参构造 | 否则 Kyro 失败 |

### 3.4 反压与网络(招 11–14)

| # | 参数 | 推荐 | 说明 |
| --- | --- | --- | --- |
| 11 | `taskmanager.network.memory.buffer-request-timeout` | 10s | buffer 等不到超时 |
| 12 | `taskmanager.network.memory.fraction` | 0.1 | 网络 buffer 占堆比例 |
| 13 | `taskmanager.network.memory.max-buffered-timeout` | 10s | 批量发送缓存 |
| 14 | `taskmanager.net.num-arenas` | = taskmanager 数 × 4 | Netty arena 数 |

**反压定位**:
```bash
# Flink WebUI → 反压面板
# 红:反压;黄:可能反压
# 看 Source / Map / Sink 三个 stage
# 用 Flink Metrics:
#   flink_taskmanager_Status_JVM_CPU_Load
#   outPoolUsage / inPoolUsage
```

### 3.5 State(招 15–16)

| # | 技巧 | 说明 |
| --- | --- | --- |
| 15 | TTL 配置 | `state.ttl=7d,cleanup策略=rocksdb` 防止 state 无限增长 |
| 16 | Keyed State vs Operator State | 优先 Keyed,可扩缩容 |

### 3.6 Source / Sink(招 17–18)

| # | 项 | 推荐 |
| --- | --- | --- |
| 17 | Kafka Source | `KafkaSource` + `setBoundedness` |
| 18 | Sink 写入 | 批量写,启用 `enable.idempotence` + `max.in.flight.requests=5` |

**Kafka Source 关键参数**:
```java
KafkaSource<String> source = KafkaSource.<String>builder()
    .setBootstrapServers("kafka:9092")
    .setTopics("topic")
    .setGroupId("flink-job")
    .setStartingOffsets(OffsetsInitializer.committedOffsets())
    .setBoundedness(Boundedness.CONTINUOUS_UNBOUNDED)
    .setDeserializer(new SimpleStringSchema())
    .setProperty("isolation.level", "read_committed")     // 读已提交
    .build();
```

---

## 4. Doris 调优清单

### 4.1 建表优化

```sql
CREATE TABLE dwd.dwd_order (
    order_id      BIGINT,
    user_id       BIGINT,
    gmv           DECIMAL(18,2),
    pay_time      DATETIME,
    province      VARCHAR(32),
    dt            DATE
)
UNIQUE KEY (order_id, dt)
PARTITION BY RANGE (dt) (
    PARTITION p202607 VALUES ['2026-07-01'], ('2026-08-01'],
    PARTITION p202608 VALUES ['2026-08-01'], ('2026-09-01']
)
DISTRIBUTED BY HASH (order_id) BUCKETS 32
PROPERTIES (
    "replication_num" = "3",
    "storage_medium" = "SSD",
    "storage_cooldown_ttl" = "30 day",                  -- 30 天后冷数据降级到 HDD
    "compaction_policy" = "size_based",
    "enable_unique_key_merge_on_write" = "true"         -- MOW 写入,查询快 3–5×
);
```

### 4.2 关键参数调优

| 类别 | BE 参数 | 推荐 |
| --- | --- | --- |
| **内存** | `mem_limit` | 物理内存 80% |
| | `load_process_max_memory_limit_percent` | 50% |
| | `compaction_process_memory_limit_percent` | 30% |
| **Compaction** | `max_base_compaction_concurrency` | 4 |
| | `max_cumulative_compaction_concurrency` | 10 |
| | `cumulative_compaction_num_deltas_per_round` | 5 |
| **Tablet** | `tablet_map_shard_size` | 4096 |
| | `max_tablet_version_num` | 2000 |
| **IO** | `max_pushdown_conjuncts_return_rate` | 0.5 |
| | `enable_lazy_open_segment` | true |
| **查询** | `parallel_fragment_exec_instance_num` | = BE CPU / 2 |
| | `max_join_buffer_size` | 64mb |

### 4.3 查询优化

| 陷阱 | 解决 |
| --- | --- |
| 大表 JOIN | 分桶对齐 + colocate join |
| 高频点查 | 开启 prepared statement + 短 schema |
| 复杂聚合 | 物化视图(MV)+ rollup |
| 数据倾斜 | `set enable_distinct_pre_aggregate_by_bitmap = true` |

### 4.4 Compaction 调优

```sql
-- 手动触发 compaction(生产慎用)
ADMIN SHOW TABLET SEGMENT;
ADMIN COMPACT TABLE dwd.dwd_order;

-- 看 compaction score
SELECT * FROM information_schema.backend_active_tasks
WHERE task_type LIKE '%compaction%';
```

### 4.5 真实故障:Doris Tablet 长时间 REPAIR

- **现象**:某个 tablet 一直 REPAIR,`show tablet` 显示 `data_完整性 = 0.6`。
- **定位**:`be.INFO` 日志报 `version=2000, max_version=2001`,**compaction 跟不上版本速度**。
- **修复**:`ADMIN SET REPLICA STATUS PROPERTIES("tablet_id" = "12345", "status" = "DECOMMISSION")`,再补副本。
- **改进**:`max_tablet_version_num=3000`,`cumulative_compaction_num_deltas_per_round=3`。

---

## 5. 调优案例复盘

### 5.1 Spark 任务从 4 小时缩到 30 分钟

**背景**:某离线 ETL 任务 4 小时,数据 2TB,SQL 多 GROUP BY。

**步骤**:
1. **Profile**:`Spark UI` 看 Stage,发现 `Stage 7` Shuffle Read 800GB,GC 时间占总时间 25%。
2. **Tier 调**:堆从 8g → 16g;`-XX:MaxGCPauseMillis=100`。
3. **Engine 调**:AQE 开;`spark.sql.adaptive.skewJoin.enabled=true`;`spark.sql.shuffle.partitions=2000`;Kryo 序列化。
4. **Job 调**:发现 `groupBy(user_id)` 热 key 集中在 5 个 VVIP;**盐值打散 + 两阶段聚合**。
5. **结果**:4h → 30min,GC 时间 25% → 4%,shuffle read 800GB → 200GB(广播省 60%)。

### 5.2 Flink 实时反压

**背景**:Kafka → Flink → Doris,流量峰值反压。

**步骤**:
1. **WebUI** 看到 Kafka Source 端反压(黄色)。
2. **定位**:Doris Sink 写太慢(`stream_load` RPC 阻塞)。
3. **修复**:`Sink` 加 batch(攒 5000 条 / 2s 再写);Doris 端 `parallel_fragment_exec_instance_num` 翻倍;`group_commit_interval_ms=100`。
4. **改进**:Flink 限流 + Doris FE 监控 + Doris BE 写吞吐看板。

### 5.3 Doris 查询 OOM

**背景**:某分析师跑 BI 报表,Doris BE 进程被杀。

**步骤**:
1. **Profile**:`EXPLAIN ANALYZE` 看 `Fragment 1` 内存 50GB,`join` 用 HashTable 太大。
2. **修复**:改写 SQL 加 `/*+ broadcast */`;分两步聚合;Doris 端 `max_join_buffer_size=32mb`。
3. **改进**:大屏必须走预聚合的物化视图;**禁止分析师直接查明细**。

---

## 6. 调优检查清单(打印贴墙)

### Tier 层
- [ ] JVM 堆 ≤ 32GB,GC 用 G1 或 ZGC
- [ ] 堆外内存独立配(`MaxDirectMemorySize`)
- [ ] OS `vm.swappiness=10`, `overcommit_memory=1`
- [ ] 网络缓冲区 ≥ 16MB
- [ ] 磁盘用 NVMe SSD
- [ ] NUMA 绑核 / 关闭跨区回收

### Spark
- [ ] Kryo 序列化
- [ ] AQE 开(skewJoin + coalescePartitions + localShuffleReader)
- [ ] Shuffle partitions 按数据量
- [ ] 小表广播阈值 100MB
- [ ] 数据倾斜用盐值 + 两阶段
- [ ] Executor 内存 16–32g,overhead 15–25%

### Flink
- [ ] RocksDB state + incremental checkpoint
- [ ] Checkpoint 间隔 ≥ min-pause
- [ ] 反压定位到具体算子
- [ ] State TTL 配置
- [ ] 序列化用 Kyro

### Doris
- [ ] 分桶数 = 节点数 × 4–8
- [ ] SSD + 冷数据 HDD
- [ ] Compaction 监控告警
- [ ] 大屏走物化视图
- [ ] BE 内存 80%,留 20% 给 OS

---

## 7. 实战任务

1. **用 async-profiler 抓一次 Spark GC**,截图火焰图。
2. **把一个真实 Spark 作业开 AQE**,对比前后时间。
3. **故意制造一个数据倾斜**(构造 90% 数据相同 key),用盐值 + AQE 解决。
4. **Flink 任务开 RocksDB state**,观察 incremental checkpoint 大小变化。
5. **Doris 建一个大表 1 亿行**,手动触发 compaction,观察 rowset 合并过程。

---

## 8. 专家面试题

1. **Spark AQE 在哪个阶段生效?Spark 3.x 必须开吗?**
   *物理计划生成后、调度前;Spark 3.x 必开,实测 30%+ 提升。*

2. **G1 GC 的 Mixed GC 和 Young GC 区别?**
   *Young = 新生代;Mixed = 新生代 + 部分老年代(CSet);G1 通过并发标记挑选收益最高的 Region 回收。*

3. **Flink RocksDB 为什么能撑 TB 级 state?**
   *LSM-Tree 写优化 + 内存写 buffer + 后台 compaction + 磁盘溢出;Spark 状态后端用的是 HashMap,只能堆内存。*

4. **数据倾斜的本质是什么?3 种解决方案?**
   *Hash 分布不均;AQE 自动 / 盐值打散 / 热 key 单独处理。*

5. **Doris 的 Bucket 和 Tablet 区别?**
   *Bucket = 建表时分区逻辑(物理 Tablet 数);Tablet = 实际副本组(默认 3 副本);改 Bucket 数要重分布。*

6. **为什么 Executor 内存不超过 32GB?**
   *Compressed Oops 阈值;超过 32GB 普通对象指针 8 字节,JVM 性能 + 内存压力都变差。*

7. **SortMergeJoin 和 BroadcastHashJoin 怎么选?**
   *小表 < 100MB 用 broadcast;否则 SortMerge,前提是 partition 数够。*

8. **Flink Checkpoint barrier 是什么?**
   *Chandy-Lamport 算法;barrier 在数据流中传播,触发快照;必须 Exactly-Once。*

9. **Doris 为什么默认冷数据降级到 HDD?**
   *冷数据访问频率 < 5%/天,HDD 单 GB 成本是 SSD 1/10,显著降本。*

10. **调优最大的误区是什么?**
    *盲目调参不看 Profile;不量化指标("看起来快了");改 5 个参数不隔离变量。*

---

## 9. 生产经验

1. **JVM 内存 ≥ 物理 75% 必崩**(OOM 概率极高)。
2. **AQE 改了 shuffle partition 数量后,务必看物理 plan 确认 partition 数变了**。
3. **Spark Streaming / Structured Streaming 的 micro-batch 不是越短越好**,1–5s 最佳。
4. **Doris compaction 高峰期禁止大表导入**,会卡集群。
5. **Flink 任务首次启动要看 backpressure 颜色**,黄/红都需要调。
6. **任何调优必须有 before/after 数据**,否则不可信。
7. **生产环境不要开 debug 日志**(`log4j.logger.org.apache.spark=DEBUG`),磁盘 / IO 炸。
8. **NUMA 跨 socket 内存访问慢 2×**,必须绑核。
9. **Spark 3.5 的 Celeborn 必须配好**,否则 shuffle OOM 频发。
10. **调优是 80/20 工作**,20% 的参数改动带来 80% 收益,聚焦真正瓶颈。

---

**下一章** → [03-故障排查清单(20+ 真实案例)](./03-troubleshooting.md)