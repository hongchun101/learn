# 11. ClickHouse 原理与生产实践

> **本章定位**:ClickHouse(简称 CH)是俄罗斯 Yandex 开源的列存 OLAP 数据库,聚合查询性能极致。本章深入 MergeTree 引擎族、PARTITION / ORDER BY、ReplacingMergeTree、Projection、Materialized View、向量计算,是日志 / 埋点 / 自助 BI 场景的"性能王"。

---

## 1. ClickHouse 整体架构

```
 ┌───────────────────────────────────────────────────────────┐
 │             ClickHouse Server(单进程/多节点)               │
 │   ┌──────────────────────────────────────────────────┐    │
 │   │  SQL 解析(自研 ClickHouse SQL 方言)              │    │
 │   │  Analyzer / Planner / Optimizer                  │    │
 │   │  Pipeline(向量化 + 火山模型)                     │    │
 │   └──────────────────────────────────────────────────┘    │
 │   ┌──────────────────────────────────────────────────┐    │
 │   │  Storage(MergeTree 引擎族)                      │    │
 │   │  - 数据按 part 写入                              │    │
 │   │  - 后台 merge(MergeMutateTask)                  │    │
 │   │  - 索引(主键 / 跳数 / 投影)                     │    │
 │   └──────────────────────────────────────────────────┘    │
 │   ┌──────────────────────────────────────────────────┐    │
 │   │  ZooKeeper / ClickHouse Keeper(副本 + 分布式)   │    │
 │   └──────────────────────────────────────────────────┘    │
 └───────────────────────────────────────────────────────────┘
```

### 1.1 与 Doris 关键区别

| 维度 | ClickHouse | Doris |
| --- | --- | --- |
| 协议 | 自家 SQL 方言 + HTTP | MySQL 协议 |
| 主键 | 排序键,允许重复 | 主键唯一(UNIQUE 模型) |
| 写入 | 异步 / 实时 | 实时同步 |
| 副本 | ZooKeeper / Keeper | BDBJE + BRPC |
| Join | 大表 Join 弱 | 多种 Join 策略 |
| 强项 | 聚合 / 日志扫描 | 实时数仓 + 高并发点查 |

---

## 2. MergeTree 引擎族

### 2.1 核心引擎

源码:`dbms/src/Storages/MergeTree/`

| 引擎 | 用途 |
| --- | --- |
| `MergeTree` | 基础引擎 |
| `ReplacingMergeTree` | 按排序键去重(后台 merge) |
| `AggregatingMergeTree` | 增量聚合 |
| `CollapsingMergeTree` | 折叠(delete 标记) |
| `VersionedCollapsingMergeTree` | 带版本折叠 |
| `SummingMergeTree` | 求和聚合 |
| `GraphiteMergeTree` | 时间序列指标 |
| `Log / TinyLog / StripeLog` | 简单日志(无索引) |

### 2.2 MergeTree 创建语法

源码:`dbms/src/Storages/MergeTree/registerStorageMergeTree.cpp`

```sql
CREATE TABLE events (
  event_date Date,
  user_id UInt64,
  event_type String,
  payload String,
  amount Float64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (user_id, event_date)
PRIMARY KEY (user_id, event_date)
SETTINGS index_granularity = 8192;
```

关键参数:
- `PARTITION BY toYYYYMM(event_date)`:按月分区。
- `ORDER BY (user_id, event_date)`:排序键(数据物理排序依据)。
- `PRIMARY KEY`:主键,默认同 ORDER BY。
- `index_granularity=8192`:每 8192 行一个 granule(数据压缩单元)。

---

## 3. PARTITION / ORDER BY 详解

### 3.1 PARTITION BY

源码:`MergeTreeData::getPartitionExpressionAST`

```
PARTITION BY toYYYYMM(event_date)
   → 数据按月份分目录:
     /data/ch/data/events/202202_partition_1_1_0/
     /data/ch/data/events/202203_partition_2_2_0/
     /data/ch/data/events/202204_partition_3_3_0/
```

优势:
- WHERE 条件命中 partition → 直接跳过。
- DROP PARTITION → 秒级删除(对比 TRUNCATE)。
- ALTER PARTITION MOVE → 冷热数据分离。

### 3.2 ORDER BY

数据按 ORDER BY 字段排序,物理上:

```
   排序键 = (user_id, event_date)
   
   part 1: user_id 0~1000 + event_date asc
   part 2: user_id 1001~2000 + event_date asc
   part 3: user_id 2001~3000 + event_date asc
   (merge 后)
```

**意义**:
- 等值 / 范围查询快(类似索引)。
- `ORDER BY` 字段前置 → 100x 加速。

源码:`MergeTreeDataPartWriter#writeBlock`。

### 3.3 Primary Key vs Sorting Key

- **Primary Key** 用于去重检测 + 二级索引。
- **Sorting Key** 用于物理排序,默认 = Primary Key。
- `PRIMARY KEY` 可选,允许不等于 ORDER BY(但范围索引范围会受限)。

---

## 4. 数据写入与 Part 合并

### 4.1 写入流程

```
   INSERT INTO events ...
       │
       ▼ MergeTreeDataWriter::writeTempPart
   写入临时 part(在 /tmp)
       │
       ▼ 后台 rename 到正式目录
   part_0_0_0(初始版本号 0)
```

源码:`StorageMergeTree::write`。

### 4.2 后台 Merge

源码:`BackgroundSchedulePool + MergeMutateTask`

```
   Part 1 + Part 2 → Merge → New Part (更高级别)
   
   level 0:初始 part(单次插入)
   level 1:第一次 merge 后的 part
   level N:第 N 次 merge 后的 part
   
   merge 策略:
   - MergeSelector 选出 N 个小 part 合并
   - 合并时按 ORDER BY 字段重新排序
   - 后台线程触发 / 手动 OPTIMIZE
```

### 4.3 手动 OPTIMIZE

```sql
OPTIMIZE TABLE events PARTITION 202202 FINAL;
-- 强制合并,合并到 level N 后停止
```

源码:`StorageMergeTree::optimize`。

---

## 5. ReplacingMergeTree

### 5.1 概念

按 ORDER BY 字段去重,但去重是 **异步** 的(在 merge 时)。

源码:`StorageReplacingMergeTree`

```sql
CREATE TABLE user_events (
  user_id UInt64,
  event_date Date,
  event_type String,
  version UInt32
) ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(event_date)
ORDER BY (user_id, event_date);
```

### 5.2 工作原理

```
   INSERT 1000 events (user_id=1)
   INSERT 1 UPDATE (user_id=1, version=2)
   
   part 1:[user=1 v=1, user=1 v=1, ..., user=1 v=1]
   part 2:[user=1 v=2]
   
   合并后:[user=1 v=2]  ← 同 ORDER BY 字段 + version 最大的留下
```

### 5.3 强一致读

```sql
SELECT * FROM user_events FINAL;
-- 强制读取已合并的 part,代价高
```

源码:`MergeTreeDataSelectExecutor#getReadSteps`。

### 5.4 实战场景

- **维度表同步**:每分钟拉 MySQL 全量,写入 ReplacingMergeTree。
- **Kafka 消费去重**:Offset 重置后用 ReplacingMergeTree 去重。

---

## 6. AggregatingMergeTree

### 6.1 概念

后台 merge 时增量聚合(SUM / COUNT)。

源码:`StorageAggregatingMergeTree`

```sql
CREATE TABLE dws_orders (
  dt Date,
  user_id UInt64,
  gmv SimpleAggregateFunction(sum, Decimal(18, 2))
) ENGINE = AggregatingMergeTree()
PARTITION BY dt
ORDER BY (dt, user_id);
```

写入用 `-State` 函数:

```sql
INSERT INTO dws_orders
SELECT
  dt,
  user_id,
  sumState(amount)  -- ★ 状态列
FROM orders
GROUP BY dt, user_id;
```

读取用 `-Merge` 函数:

```sql
SELECT
  dt,
  sumMerge(gmv) AS gmv_total
FROM dws_orders
GROUP BY dt;
```

源码:`Aggregator::mergeBlock`。

### 6.2 SimpleAggregateFunction vs AggregateFunction

| 类型 | 用途 |
| --- | --- |
| SimpleAggregateFunction | 求和/求最大等可结合函数 |
| AggregateFunction(uniq, quantile) | uniqExact / quantiles(状态合并) |

---

## 7. CollapsingMergeTree 与 VersionedCollapsing

### 7.1 CollapsingMergeTree

源码:`StorageCollapsingMergeTree`

```sql
CREATE TABLE orders (
  order_id UInt64,
  amount Float64,
  sign Int8  -- 1 = add, -1 = delete
) ENGINE = CollapsingMergeTree(sign)
ORDER BY order_id;
```

写入:
```sql
INSERT INTO orders VALUES (1, 100, 1);  -- add
INSERT INTO orders VALUES (1, 100, -1); -- delete
```

merge 后,1 个 add + 1 个 delete = 删除(同 ORDER BY 字段)。

### 7.2 VersionedCollapsingMergeTree

源码:`StorageVersionedCollapsingMergeTree`

```sql
CREATE TABLE orders (
  order_id UInt64,
  amount Float64,
  sign Int8,
  version UInt32
) ENGINE = VersionedCollapsingMergeTree(sign, version);
```

支持乱序合并(同 ORDER BY 但 version 大的留下)。

---

## 8. Projection(投影)

### 8.1 概念

源码:`StorageInMemoryMetadata::projections`

投影 = 同一份数据,但按不同排序键再存一份。查询时根据 SQL 自动选择最优投影。

```sql
CREATE TABLE events (
  user_id UInt64,
  event_date Date,
  event_type String,
  payload String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, user_id)
PROPERTIES (
  'projection' = 'projection_user_type
    (SELECT user_id, event_type, count() GROUP BY user_id, event_type)'
);
```

### 8.2 投影适用场景

- 查询既有按 `ORDER BY` 排序,又有按其他字段排序的需求。
- 数据量较大(投影开销大),不适合小表。
- 投影自动维护(写入时同步更新)。

源码:`InterpreterSelectQuery#execute`。

---

## 9. Materialized View(MV)

### 9.1 概念

源码:`StorageMaterializedView`

MV = 增量聚合的表,底层由查询+源表+触发器组成。

```sql
CREATE MATERIALIZED VIEW dws_orders_mv
ENGINE = SummingMergeTree()
PARTITION BY dt
ORDER BY (dt, region)
AS
SELECT
  dt,
  region,
  count() AS cnt,
  sum(amount) AS gmv
FROM orders
GROUP BY dt, region;
```

写入源表后,MV 自动增量更新。

### 9.2 MV 的注意事项

- MV 是"实时"的,但不保证不重不丢(底层由源表 mutation 触发)。
- DROP MV 不会影响源表。
- 多个 MV = 多次源表扫描,写入放大。

### 9.3 MV 与 Projection 的对比

| 维度 | MV | Projection |
| --- | --- | --- |
| 灵活性 | 完全独立的表 | 同一份数据多索引 |
| 存储 | 独立存储 | 同表存储 |
| 维护 | 源表写入触发 | 自动同步 |
| 适用 | 大聚合 + 时间长 | 简单查询优化 |

---

## 10. 向量计算

### 10.1 向量化原理

源码:`dbms/src/Processors/QueryPipeline`

- 列存:每列一次处理 8192 行(granule)。
- SIMD:AVX-2 / SSE4.2 指令集。
- CPU 缓存:连续访问同一列,缓存命中率高。

### 10.2 关键 Operator

源码:`dbms/src/Processors/`

| Operator | 作用 |
| --- | --- |
| `ISource` | 数据源 |
| `FilterTransform` | WHERE |
| `ExpressionTransform` | Project |
| `MergingAggregatedMemoryEfficientTransform` | 聚合 |
| `JoinTransform` | Join |
| `MergeSortingTransform` | 排序 |
| `LimitTransform` | LIMIT |

### 10.3 Pipeline 模型

```
Pipeline 1:Source → Filter → Project → Sink
Pipeline 2:Source → Aggregate → Sink
Pipeline 3:Source → Sort → TopN → Sink
```

源码:`QueryPipeline#execute`。

### 10.4 性能对比

```
   ClickHouse vs Spark SQL vs MySQL
   TPC-H Q1:100x / 10x / 1x
   (ClickHouse 聚合查询最快,MySQL 100 GB 跑不动)
```

---

## 11. 索引

### 11.1 主键索引

源码:`MergeTreeDataPart::index_granularity_info`

- 主键索引 = 每 8192 行一组(Mark)。
- 数据按主键排序,Mark 用二分查找定位。

### 11.2 跳数索引(Skip Index)

```sql
ALTER TABLE events ADD INDEX idx_event_type event_type TYPE set(100) GRANULARITY 4;
ALTER TABLE events ADD INDEX idx_user_id user_id TYPE minmax GRANULARITY 4;
ALTER TABLE events MATERIALIZE INDEX idx_event_type;
```

源码:`MergeTreeIndexFactory`。

| 类型 | 用途 |
| --- | --- |
| `minmax` | 范围 |
| `set` | 低基数等值 |
| `bloom_filter` | 等值 |
| `tokenbf_v1` | 全文 |
| `ngrambf_v1` | 字符串 |

### 11.3 索引生效条件

- WHERE 条件命中 `ORDER BY` 字段前缀 → 100x 加速。
- 跳数索引命中率 > 50% 才划算。

---

## 12. 分布式架构

### 12.1 ClickHouse 集群

源码:`dbms/src/Interpreters/Cluster`

```
   ClickHouse Cluster:
       shard-1(3 replicas)
       shard-2(3 replicas)
       shard-3(3 replicas)
       ...
```

- **本地表**:每个 shard 各自存,`INSERT` 默认随机 shard。
- **分布式表**:`Distributed` 引擎,跨 shard 查询 / 写入。

### 12.2 Distributed Table

```sql
-- 1. 本地表
CREATE TABLE events_local ON CLUSTER '{cluster}' (
  ...
) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/events_local', '{replica}')
  PARTITION BY toYYYYMM(event_date)
  ORDER BY (user_id, event_date);

-- 2. 分布式表
CREATE TABLE events ON CLUSTER '{cluster}' (
  ...
) ENGINE = Distributed('{cluster}', currentDatabase(), 'events_local');
```

### 12.3 副本同步

- **ZooKeeper / ClickHouse Keeper**:存 part 元数据 + log entry。
- **ReplicatedMergeTree**:基于 Keeper 的状态机。
- 写入流程:Leader 写 part → Keeper log entry → Follower 拉 part。

源码:`StorageReplicatedMergeTree`。

---

## 13. 生产参数清单

`config.xml`:

```xml
<!-- 监听 -->
<listen_host>0.0.0.0</listen_host>
<tcp_port>9000</tcp_port>
<http_port>8123</http_port>
<mysql_port>9004</mysql_port>

<!-- 内存 -->
<max_server_memory_usage>80%</max_server_memory_usage>
<max_thread_pool_size>10000</max_thread_pool_size>

<!-- Merge -->
<background_pool_size>16</background_pool_size>
<background_schedule_pool_size>128</background_schedule_pool_size>
<merge_selecting_sleep_ms>5000</merge_selecting_sleep_ms>

<!-- 副本 -->
<zookeeper>
  <node>
    <host>zk-host</host>
    <port>2181</port>
  </node>
</zookeeper>

<!-- 远程存储 -->
<storage_configuration>
  <disks>
    <disk_hot>
      <path>/data1/ch/hot/</path>
    </disk_hot>
    <disk_cold>
      <path>/data2/ch/cold/</path>
    </disk_cold>
  </disks>
</storage_configuration>
```

---

## 14. 生产实战任务

### 14.1 任务一:ReplacingMergeTree + Kafka 同步

```sql
CREATE TABLE kafka_events (
  id UInt64,
  user_id UInt64,
  event_type String,
  ts DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (user_id, id);

CREATE TABLE kafka_users (
  user_id UInt64,
  name String,
  version UInt32
) ENGINE = ReplacingMergeTree(version)
ORDER BY user_id;
```

### 14.2 任务二:Materialized View 增量聚合

```sql
CREATE MATERIALIZED VIEW dws_orders_mv
ENGINE = SummingMergeTree()
PARTITION BY dt
ORDER BY (dt, region)
AS
SELECT
  toDate(ts) AS dt,
  region,
  count() AS cnt,
  sum(amount) AS gmv
FROM kafka_orders
GROUP BY dt, region;
```

### 14.3 任务三:Projection 加速

```sql
ALTER TABLE events
ADD PROJECTION projection_user_type
(SELECT user_id, event_type, count() GROUP BY user_id, event_type);

ALTER TABLE events MATERIALIZE PROJECTION projection_user_type;

-- 验证
EXPLAIN SELECT count() FROM events WHERE user_id = 12345 AND event_type = 'click';
-- 看是否命中 projection
```

### 14.4 任务四:Distributed Cluster 表

```xml
<!-- config.xml 中的 remote_servers -->
<remote_servers>
  <cluster_3shards>
    <shard>
      <replica><host>node1</host><port>9000</port></replica>
      <replica><host>node2</host><port>9000</port></replica>
    </shard>
    <shard>
      <replica><host>node3</host><host><port>9000</port></replica>
      <replica><host>node4</host><port>9000</port></replica>
    </shard>
  </cluster_3shards>
</remote_servers>
```

```sql
CREATE TABLE events_local ON CLUSTER cluster_3shards (
  ...
) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/events', '{replica}')
  PARTITION BY toYYYYMM(event_date)
  ORDER BY (user_id, event_date);

CREATE TABLE events ON CLUSTER cluster_3shards (
  ...
) ENGINE = Distributed(cluster_3shards, currentDatabase(), events_local);
```

### 14.5 任务五:冷热分层

```sql
CREATE TABLE events (
  ...
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(event_date)
  ORDER BY (user_id, event_date)
  SETTINGS storage_policy = 'tiered_storage';

-- tiered_storage policy:
--   hot volume → SSD
--   cold volume → HDD / S3

ALTER TABLE events MODIFY TTL event_date + INTERVAL 30 DAY TO VOLUME 'cold',
                        event_date + INTERVAL 90 DAY DELETE;
```

---

## 15. 专家面试题

1. **ClickHouse 的主键与排序键关系?**
   *要点*:默认 ORDER BY 就是 PRIMARY KEY,可分离但生产几乎不分离;主键用于二级索引 + Mark 索引。
2. **ReplacingMergeTree 怎么去重?**
   *要点*:后台 merge 时按 ORDER BY 字段去重,留 version 大的;查询时不保证去重,需 `FINAL`。
3. **AggregatingMergeTree 的状态合并?**
   *要点*:写入用 `sumState/uniqState`,后台 merge 时合并状态,查询用 `sumMerge/uniqMerge`。源码 `Aggregator::mergeBlock`。
4. **ClickHouse 的向量化执行?**
   *要点*:列存 + granule(8192 行) + SIMD,CPU 缓存命中率高;Pipeline 模型并行算子。
5. **ClickHouse 的索引粒度?**
   *要点*:默认 8192 行 / granule;`index_granularity` 可调。粒度细 = 索引大但定位准;粒度粗 = 索引小但扫描多。
6. **ClickHouse 与 Doris 的核心区别?**
   *要点*:CH 自家协议 + 异步写入 + 后台合并;Dor MySQL 协议 + 实时同步 + 多副本。CH 偏日志分析,Dor 偏实时数仓。
7. **Distributed 表的工作原理?**
   *要点*:本地表 + 分布式表;查询分两阶段(各 shard 查 → coordinator 合并);写入随机分片 + 副本同步。
8. **Materialized View 与 Projection 区别?**
   *要点*:MV 是独立表(独立存储),Projection 是同表多索引;MV 灵活(任意 SQL),Projection 受限(同表字段)。
9. **CollapsingMergeTree 为什么需要 sign?**
   *要点*:标记 add/delete,merge 时同 sign 字段折叠删除;适合 OLTP 同步场景。
10. **ClickHouse 副本怎么同步?**
    *要点*:ZooKeeper / ClickHouse Keeper 存 part 元数据 + log entry,ReplicatedMergeTree 基于 Keeper 状态机同步。
11. **ClickHouse 高并发点查为什么差?**
    *要点*:CH 是列存聚合引擎,适合大批量扫描;并发点查时,MergeTree 索引虽快,但 SQL Parser / Coordinator 是单点,无法横向扩展。
12. **如何优化 ClickHouse 聚合性能?**
    *要点*:调整 `ORDER BY` 让聚合字段在前;用 `AggregatingMergeTree` 预聚合;调整 `index_granularity` 适应查询粒度。
13. **ClickHouse 的 Mark 文件是什么?**
    *要点*:每 8192 行一个 Mark,主键索引用 Mark 二分定位;源码 `MergeTreeDataPart::mark_files`。
14. **ClickHouse 的冷热分层怎么做?**
    *要点*:多 volume + TTL 策略 + 移动 part 到冷盘;源码 `StoragePolicy`。

---

## 16. 一张图回顾 ClickHouse

```
   ClickHouse Server
       │
       ├─ SQL 层
       │   ├─ Parser (自研 ClickHouse SQL)
       │   ├─ Analyzer
       │   ├─ Planner
       │   └─ Optimizer
       │
       ├─ Pipeline 层
       │   ├─ QueryPipeline
       │   ├─ Executor(Vectorized)
       │   └─ Operator Pipeline
       │
       ├─ Storage 层
       │   ├─ MergeTree 引擎族
       │   │   ├─ MergeTree
       │   │   ├─ ReplacingMergeTree
       │   │   ├─ AggregatingMergeTree
       │   │   ├─ CollapsingMergeTree
       │   │   └─ SummingMergeTree
       │   ├─ Part Manager
       │   ├─ Merge Background Pool
       │   └─ Index(Mark / Skip / Projection)
       │
       └─ 副本 / 分布式
           ├─ ZooKeeper / Keeper
           ├─ ReplicatedMergeTree
           └─ Distributed Table
```

---

## 17. 小结与回顾

至此 **12 章计算篇** 全部讲完,从 MapReduce 到 Doris / ClickHouse:

| 引擎 | 核心定位 |
| --- | --- |
| MapReduce | 离线批处理"汇编语言" |
| YARN | 大数据资源调度 OS |
| Spark | 内存 + DAG + 统一 API |
| Flink | 真流式 + Exactly-Once |
| Doris | 实时数仓首选 |
| ClickHouse | 日志 / 聚合极致性能 |
| Presto/Trino | 联邦查询引擎 |

50K 大数据工程师的核心能力:
- 看见问题能定位到 **源码层**(MapOutputBuffer / DAGScheduler / MailBox / Nereids / MergeTree)。
- **参数能讲出默认值 + 适用场景**(`io.sort.mb=100` / `spark.memory.fraction=0.6` / `state.backend.incremental=true`)。
- **架构选型能落地生产**(Spark + Iceberg + Doris + Flink CDC 组合)。

---

## 18. 推荐阅读

1. **书籍**
   - 《Spark 权威指南》(Spark The Definitive Guide)
   - 《Flink 设计与实现:核心原理与源码解析》
   - 《ClickHouse 原理解析与应用实践》
   - 《Hadoop 技术内幕:深入解析 MapReduce 架构设计与实现原理》

2. **官方文档**
   - [https://spark.apache.org/docs/latest/](https://spark.apache.org/docs/latest/)
   - [https://nightlies.apache.org/flink/flink-docs-stable/](https://nightlies.apache.org/flink/flink-docs-stable/)
   - [https://clickhouse.com/docs/](https://clickhouse.com/docs/)
   - [https://doris.apache.org/zh-CN/docs/](https://doris.apache.org/zh-CN/docs/)

3. **源码必读路径**
   - Spark:`DAGScheduler.scala` + `SparkPlan.scala` + `ShuffleExternalSorter.scala`
   - Flink:`StreamingJobGraphGenerator.java` + `CheckpointCoordinator.java` + `RocksDBIncrementalCheckpoint.java`
   - Doris:`NereidsPlanner.java` + `ColocateJoinChecker.java` + `StreamLoadPlanner.java`
   - ClickHouse:`MergeTreeDataPartWriter.cpp` + `Aggregator.cpp` + `StorageReplicatedMergeTree.cpp`

**至此,本教程计算篇(03-compute)12 章完成,后续将进入调度与消息(04-resource-messaging)与架构篇(05-architecture)。**