# 05. Hudi 原理与生产实践

> **本章定位**:Hudi(Hadoop Upserts Deletes and Incrementals)是 Uber 在 2017 年开源的湖格式,**主打"实时增量更新 + 流式摄取"**。本章从表类型、Timeline、Index 三大支柱讲起,覆盖 CoW/MoR 表的读写差异、Bloom/HBase/Flink Index 的取舍、Compaction 策略。
>
> **学习目标**:能讲清 CoW 与 MoR 的区别、能在面试中讲清楚 Hudi Timeline 的原理、能根据场景选 Index 类型。

---

## 1. Hudi 诞生的背景

Uber 的需求:**把司机/订单的实时变更增量写入数据湖,既能查询历史,也能高时效查询当前状态**。
- 用 Hive 表:只能 OVERWRITE 整个分区,延迟小时级。
- 用 HBase:扩展性差,几 TB 就要拆分。
- 用 Kudu:生态受限。

Hudi 的目标:**在 Parquet/列存之上,提供行级 update + 时间旅行 + 增量查询**。

---

## 2. Hudi 表类型:CoW vs MoR

### 2.1 Copy-on-Write(CoW)

```
写入路径:
  1. 收到 UPDATE/DELETE
  2. 读整段 Parquet 文件(可能几 GB)
  3. 在内存里按主键合并新数据
  4. 写新的 Parquet 文件,旧文件标 "delete"
  5. 提交 Timeline
```

**特点**:
- 读路径只查 Parquet(没有 Log 文件),查询性能最佳。
- 写代价高(每次 update 都重写文件),适合**批量更新、低频更新**。

### 2.2 Merge-on-Read(MoR)

```
写入路径:
  1. 收到 UPDATE/DELETE
  2. 写增量到 .log 文件(Avro 格式的 Row-based WAL)
  3. 不重写 Parquet 文件
  4. 提交 Timeline,记录 log 文件引用
读取路径:
  1. 读 Base Parquet 文件
  2. 读关联的 .log 文件
  3. 在内存合并 base + log
```

**特点**:
- 读路径需要合并 log,延迟略高。
- 写代价极低,**适合高频小写入、CDC 同步**。
- 后台 Compaction 把 log 合并进 base,恢复读性能。

### 2.3 选型矩阵

| 场景 | 推荐 | 理由 |
| --- | --- | --- |
| 批量写入(每日 ETL) | CoW | 写后查,读性能最佳 |
| CDC 实时摄取(MySQL → Hudi) | MoR | 写频繁,延迟敏感 |
| 增量查询(拉最近 1 小时变更) | MoR | 直接读 .log,无需 Compaction |
| 历史归档、偶发更新 | CoW | 简单 |

---

## 3. Hudi Timeline(时间线)

源码入口:`hudi-client-common/src/main/java/org/apache/hudi/common/table/timeline/HoodieTimeline.java`

### 3.1 Timeline 是什么

每次对 Hudi 表的 commit 都产生一条 Timeline 记录,按时间倒序排列。每条记录是原子操作单元,包含:
- **Action Type**:`COMMIT`/`DELTA_COMMIT`/`REPLACE_COMMIT`/`CLEAN`/`SAVEPOINT`/`ROLLBACK`
- **Instant Time**:`20240101120000`(类似 Flink checkpoint ID)
- **State**:`REQUESTED` → `INFLIGHT` → `COMPLETED`

### 3.2 实例

```
20240101120000 - COMMIT (CoW,5 files)
20240101130000 - DELTA_COMMIT (MoR,10 log files)
20240101140000 - REPLACE_COMMIT (Cluster,3 files replaced)
20240101150000 - SAVEPOINT (备份点,可回滚)
20240101160000 - CLEAN (清理旧版本)
```

### 3.3 关键 API

- `getCommitsTimeline()`:只读 commit/delta_commit。
- `getCommitsAndCompactionTimeline()`:包含 compaction。
- `getPendingCommits()`:未完成的提交(用于检测并发)。

### 3.4 Time Travel

```sql
-- Spark SQL
SELECT * FROM hudi_t1 TIMESTAMP AS OF '20240101120000';
SELECT * FROM hudi_t1 VERSION AS OF 1024;  -- 内部版本号
```

---

## 4. Hudi 的写入流程

源码入口:`hudi-client-common/src/main/java/org/apache/hudi/client/BaseHoodieWriteClient.java`

### 4.1 整体流程

```
1. initWrite()
   - 创建 HoodieWriteConfig (表/索引类型/Compaction 策略)
2. startCommit()
   - 在 Timeline 创建 INFLIGHT 记录
3. upsert()/insert()/delete()
   - 1. 索引查找:哪些文件涉及此批记录
   - 2. 标记/读取旧文件
   - 3. 分组(按 file group 分桶)
   - 4. 并行执行(每桶一个 Task)
   - 5. 写新文件(CoW:Parquet;MoR:log)
4. commit()
   - 把新文件路径写到 Timeline .commit 文件
   - 状态:INFLIGHT → COMPLETED
   - 失败可 ROLLBACK
```

### 4.2 关键对象

- **HoodieRecord**:一条记录,带主键、payload(默认值/合并逻辑)。
- **HoodieFileGroup**:一个 File Group = 一个主键分区内的所有版本文件。
- **HoodieFileSlice**:同一 File Group 在某一版本下的(base file + log files)。

---

## 5. Index(索引)

索引是 Hudi 性能的核心:它回答"这条新记录的目标文件在哪儿"。

### 5.1 五种索引

| 索引 | 实现 | 适用 | 代价 |
| --- | --- | --- | --- |
| **Bloom Index** | 文件 Bloom Filter | 简单场景 | 偶尔 false positive,误读文件 |
| **Simple Index** | 全表扫描 | 小表 | 慢 |
| **HBase Index** | 外部 HBase | 实时高并发 | 依赖 HBase 运维 |
| **Flink State Index** | Flink 内 State | 流式 | 只在 Flink 引擎 |
| **Metadata Index** (Spark) | 元数据文件 RLI | 默认新选项 | 内存负担 |

### 5.2 Bloom Index(默认)

- 在每个 Parquet 文件上建 Bloom Filter,写入时检查主键是否在该文件。
- 误报率约 1–5%,带来额外 5% 文件读取,但能极大减少无谓扫描。
- **适合中等规模 + 主键分布均匀**。

### 5.3 HBase Index

- 把"(主键, 文件路径)"映射写到外部 HBase。
- 全局精确查找,无 false positive。
- **适合大规模 + 频繁 update**。
- **代价**:依赖 HBase 集群,写入延迟多 5–10 ms,故障时丢失未提交 HBase 写入。

### 5.4 Flink State Index

- Flink 引擎独有,索引存在 Flink RocksDB State。
- 流式作业专用,Flink 进程崩溃要 restore State。
- **不适合 Spark 作业**。

### 5.5 选型

| 数据量 | 主键分布 | 推荐 |
| --- | --- | --- |
| < 1 TB | 任意 | Simple / Bloom |
| 1–100 TB | 均匀 | Bloom |
| > 100 TB | 不均匀 | HBase |
| Flink 实时摄取 | 任意 | Flink State |

---

## 6. Compaction

源码入口:`hudi-client-common/src/main/java/org/apache/hudi/table/action/compact/HoodieCompactor.java`

### 6.1 为什么需要?

MoR 表的 log 文件越积越多,读路径需要合并 log,**log 多了读延迟飙升**。Compaction 把 log 合并到 base,恢复读性能。

### 6.2 触发策略

| 策略 | 触发 |
| --- | --- |
| **Schedule(被动)** | 每次 commit 后检查 log 数,超过阈值则 schedule |
| **Inline(同步)** | 写入时直接触发 compaction |
| **Async(异步)** | 独立 compaction service 调度 |

### 6.3 关键参数

```yaml
hoodie.compact.inline.max.delta.commits: 5       # 累积 5 个 delta_commit 触发 inline
hoodie.compact.inline.max.delta.seconds: 3600     # 或 1 小时
hoodie.compact.max.num.largest.file: 100          # log 文件上限
hoodie.parquet.small.file.limit: 104857600         # 小文件 < 100MB
hoodie.copyonwrite.record.size.estimate: 1024     # 每行预估字节数
```

### 6.4 故障案例:Compaction 卡住

**症状**:MoR 表读延迟持续升高。
**根因**:Compaction 没执行,可能是 executor 资源不够或 schedule 失败。
**排查**:
```bash
# Hudi CLI
hudi-cli timeline --tablePath /path/to/tbl
hudi-cli compactions show --tablePath /path/to/tbl
```
**调优**:提高 `hoodie.compact.inline.max.delta.commits` 让 log 少一些;或迁移到 async compaction,独立集群执行。

---

## 7. Storage Layout

Hudi 文件目录结构(以 MoR 为例):
```
table-path/
  ├── .hoodie/
  │    ├── 20240101120000.commit         # Timeline
  │    ├── 20240101130000.commit
  │    ├── 20240101140000.inflight
  │    ├── 20240101150000.rollback
  │    ├── archived/                      # 归档的 timeline
  │    └── hoodie.properties
  ├── 2024/01/01/                         # 分区路径
  │    ├── 8f23b1f8-2f0e-4d3f-8e9d-0e9f7b3e0e9d-0_1-2-0_20240101120000.parquet  # base
  │    ├── 8f23b1f8-2f0e-4d3f-8e9d-0e9f7b3e0e9d-0_1-2-0_20240101130000.log        # log 1
  │    └── 8f23b1f8-2f0e-4d3f-8e9d-0e9f7b3e0e9d-0_1-2-0_20240101140000.log        # log 2
```

每个 `parquet` 或 `log` 文件名包含:File ID + Write Token + Instant Time,确保唯一。

---

## 8. 关键生产调优参数

```java
HoodieWriteConfig config = HoodieWriteConfig.newBuilder()
    .withPath("/path/to/tbl")
    .withSchema(schemaStr)
    .withPayloadClassName("org.apache.hudi.common.model.DefaultHoodieRecordPayload")
    // 表类型
    .withTableType(HoodieTableType.MERGE_ON_READ)
    // 索引
    .withIndexConfig(HoodieIndexConfig.newBuilder()
        .withIndexType(HoodieIndex.IndexType.BLOOM)
        .withBloomConfig(BloomIndexFilteringPolicy.PNG, 1024 * 1024 * 1024L)
        .build())
    // Compaction
    .withCompactionConfig(HoodieCompactionConfig.newBuilder()
        .withInlineCompaction(true)
        .withMaxNumDeltaCommitsBeforeCompaction(5)
        .withCompactionStrategy(CompactionStrategy.LAZY)
        .build())
    // 文件大小
    .withProps(Map.of(
        "hoodie.parquet.max.file.size", "536870912",      // 512 MB
        "hoodie.logfile.max.size", "1073741824"          // 1 GB
    ))
    .build();
```

---

## 9. 生产经验(踩坑 & 调优)

### 9.1 踩坑清单

| 踩坑 | 现象 | 解决 |
| --- | --- | --- |
| CoW 写慢 | Update 时全量重写 | 改 MoR |
| MoR 读慢 | log 累积 | 启用 inline compaction |
| 主键冲突 | Duplicate key 异常 | 启用 `enableOptimisticConcurrencyControl=true` |
| HBase Index 单点 | 写入失败 | 启用 HBase HA |
| Timeline 膨胀 | Metadata 操作慢 | 启用 `hoodie.timeline.archive` |
| 小文件多 | 查询 Plan 慢 | 调 `hoodie.parquet.small.file.limit` + clustering |

### 9.2 监控指标

| 指标 | 含义 |
| --- | --- |
| `commit_lag` | 上次 commit 到现在的延迟 |
| `compaction_pending` | 待执行的 compaction 数 |
| `log_file_count` | 当前 log 文件数(警戒 > 50) |
| `timeline_growth` | Timeline 文件增长率 |

---

## 10. 实战任务

### 任务 1:Spark + Hudi CDC

```python
from pyspark.sql import SparkSession
spark = SparkSession.builder \
    .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer") \
    .config("spark.sql.extensions", "org.apache.spark.sql.hudi.HoodieSparkSessionExtension") \
    .getOrCreate()

df = spark.read.json("kafka_source")
hudi_table_options = {
    'hoodie.table.name': 'orders',
    'hoodie.datasource.write.table.type': 'MERGE_ON_READ',
    'hoodie.datasource.write.operation': 'upsert',
    'hoodie.datasource.write.precombine.field': 'ts',
    'hoodie.datasource.write.recordkey.field': 'order_id',
    'hoodie.index.type': 'BLOOM',
    'hoodie.compact.inline.max.delta.commits': '5',
}

df.write.format("hudi").options(**hudi_table_options).mode("append").save("/path/to/tbl")
```

### 任务 2:Time Travel

```sql
-- 增量查询:拉 instant > '20240101120000' 的所有记录
SELECT * FROM hudi_orders TIMESTAMP AS OF '20240101120000';
```

### 任务 3:观察 Hudi 表目录结构

```bash
# 看 .hoodie 目录
ls -la /path/to/tbl/.hoodie/
# 看 base + log
ls -la /path/to/tbl/2024/01/01/
```

---

## 11. 专家面试题(5 题)

1. **CoW 和 MoR 在读 / 写 / Compaction 上各自有什么特点?生产中如何选?**
2. **Hudi Timeline 是什么?为什么使用 INFLIGHT / COMPLETED 两阶段?**
3. **Hudi Index 中 Bloom 和 HBase 各自适合什么场景?为什么 Flink State 索引只能在 Flink 引擎用?**
4. **MoR 表的 Compaction 是怎么触发的?Inline 与 Async 各适合什么场景?**
5. **Hudi 与 Iceberg 在"行级 update"上的实现差异?**

---

## 12. 本章小结

- Hudi 的核心创新:**Timeline 抽象 + File Group + Index**,把"实时增量写入"做成了"湖上的流处理"。
- **CoW 适合分析查询,MoR 适合 CDC 实时摄取**。
- **Index 是 Hudi 性能的命门**。
- 下一章:Paimon(原 Flink Table Store),Flink 生态的湖格式。

下一章:[06-Paimon(原 Flink Table Store)原理](./06-paimon-internals.md)