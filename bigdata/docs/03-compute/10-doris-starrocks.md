# 10. Doris / StarRocks 原理与调优

> **本章定位**:Doris / StarRocks 是国产自研 OLAP 数据库的代表,**实时数仓首选**。本章深入 FE / BE / Catalog 三层架构、Colocation Join、Bucketed Shuffle Join、Bitmap Index、Insert Into 自适应,所有源码均指向 Apache Doris 2.x / StarRocks 3.x。

---

## 1. Doris / StarRocks 整体架构

```
 ┌──────────────────────────────────────────────────────────────┐
 │                    FE (Frontend)                             │
 │   - 接收 MySQL 协议                                         │
 │   - SQL 解析 / 优化(Nereids CBO)                             │
 │   - 元数据管理                                              │
 │   - 调度 BE 节点                                            │
 │   - 多 FE HA                                                │
 └──────────────────────────────────────────────────────────────┘
                              │
                              ▼ (BRPC RPC)
 ┌──────────────────────────────────────────────────────────────┐
 │                    BE (Backend)                              │
 │   - 存储 Tablet(数据分区)                                    │
 │   - 执行 PlanFragment                                       │
 │   - 副本管理(多副本)                                       │
 │   - Stream Load / Routine Load                              │
 └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────┐
 │                    Tablet (数据分片)                         │
 │   - 副本数:replication_num=3                                │
 │   - Schema:Key / Value 排序                                  │
 │   - 存储:Segment + Page + Columnar                          │
 └──────────────────────────────────────────────────────────────┘
```

### 1.1 核心特性

| 特性 | 含义 |
| --- | --- |
| MySQL 协议兼容 | 客户端零成本接入 |
| 向量化执行 | SIMD + 列存 + 火山模型 |
| CBO 优化器 | Nereids(Cascades) |
| 实时写入 | Stream Load + Routine Load |
| 高并发点查 | 副本 + Tablet + 索引 |
| 湖格式查询 | Iceberg / Hudi / Paimon |

---

## 2. FE 架构详解

源码:`org.apache.doris.service.FrontendServiceImpl`(FE 入口)

### 2.1 FE 内部组件

```
FE 进程:
   ├─ FrontendServiceImpl(MySQL 协议)
   ├─ NereidsPlanner(CBO 优化器)
   ├─ QeProcessorService(Query Executor)
   ├─ CatalogManager(元数据)
   ├─ TabletScheduler(Tablet 调度)
   ├─ StreamLoadRecordMgr(Stream Load)
   └─ BDBJE(元数据持久化)
```

### 2.2 Nereids Planner(CBO)

源码:`org.apache.doris.nereids.Planner`

```
SQL → Parser → Analyzer → Nereids Planner → Optimized Plan → Execution
                    │
                    └─ Cascades Framework:
                       1. Optimized Group Expression
                       2. Cost Model
                       3. Implementation Rules
                       4. Exploration Rules
```

源码:`org.apache.doris.nereids.cost.CostModel`。

### 2.3 FE HA

- BDBJE(Oracle Berkeley DB Java Edition)做元数据共享。
- Follower / Observer 节点。
- Leader 选举:ZAB 协议类似。

---

## 3. BE 架构详解

源码:`org.apache.doris.be.service.BackendService`

### 3.1 BE 内部组件

```
BE 进程:
   ├─ BRPC Server(接收 FE RPC)
   ├─ FragmentExecutor(SQL 执行)
   ├─ TabletManager(Tablet 管理)
   ├─ StorageEngine(存储引擎)
   ├─ VectorizedExecutor(向量化执行)
   └─ StreamLoadExecutor(Stream Load)
```

### 3.2 执行模型:Fragment + Pipeline

```
PlanFragment 1: Scan + Project + Filter (1 instance / tablet)
PlanFragment 2: Join + Aggregate (1 instance / BE)
```

源码:`org.apache.doris.common.Fragment`。

### 3.3 Pipeline 执行

源码:`org.apache.doris.planner.PipelineExecutor`

```
   Pipeline:
      PipelineTask 1 → PipelineTask 2 → ... → PipelineTask N

   PipelineTask 内:
      SourceOperator → FilterOperator → ProjectOperator → ExchangeOperator
```

`Pipeline` 异步执行,`PipelineTask` 跨多线程,流水线加速。

---

## 4. 存储引擎

### 4.1 Tablet / Segment / Page

```
Table
   └─ Tablet 1   (replication_num=3)
   │     └─ Segment 1  (~ 256 MB)
   │     │     └─ Page 1
   │     │     └─ Page 2
   │     │     ...
   │     └─ Segment 2
   │     ...
   └─ Tablet 2
```

源码:`org.apache.doris.tablet.Tablet`。

### 4.2 列存 + 索引

| 索引 | 作用 |
| --- | --- |
| **Sort Key** | 表的主键 + 排序键,数据按此排序存储,前缀扫描极快 |
| **Min/Max** | 每 Page 一组,WHERE 条件过滤 |
| **BloomFilter** | 等值查询过滤 |
| **Bitmap Index** | 低基数列等值查询 |
| **ZoneMap Index** | 范围查询 |
| **Inverted Index** | 全文检索 |

源码:`org.apache.doris.index.IndexFactory`。

### 4.3 Bitmap Index

源码:`org.apache.doris.index.BitmapIndex`

适用:低基数列(性别、地区、状态)。比 Bloom Filter 慢但精确。

```sql
CREATE TABLE orders (
  id BIGINT,
  region VARCHAR(20),
  status TINYINT
)
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 16
PROPERTIES (
  "bloom_filter_columns" = "region, status",
  "indexes" = "(region) USING BITMAP"
);
```

---

## 5. 表模型

### 5.1 三种表模型

| 模型 | 用途 | Key 处理 |
| --- | --- | --- |
| DUPLICATE KEY | 原始日志表 | 保留所有重复行 |
| UNIQUE KEY | 维度表(upsert) | 同 key 覆盖 |
| AGGREGATE KEY | 指标聚合表 | 同 key 聚合(SUM/MAX/MIN 等) |

```sql
-- AGGREGATE 模型(指标表)
CREATE TABLE dws_orders (
  dt DATE,
  region VARCHAR(20),
  user_id BIGINT,
  amount DECIMAL(18, 2) SUM,
  cnt BIGINT SUM
)
AGGREGATE KEY(dt, region, user_id)
PARTITION BY RANGE(dt) (
  PARTITION p202601 VALUES IN ('2026-01-01'),
  PARTITION p202602 VALUES IN ('2026-02-01')
)
DISTRIBUTED BY HASH(user_id) BUCKETS 32
PROPERTIES (
  "storage_medium" = "SSD",
  "storage_cooldown_time" = "2026-03-01 00:00:00"
);
```

### 5.2 Bucket 与分桶

源码:`org.apache.doris.common.util.HashUtil`

```sql
-- 32 个 bucket,按 user_id hash
DISTRIBUTED BY HASH(user_id) BUCKETS 32
```

每个 bucket = 一个 Tablet,FE 把 Tablet 调度到 BE。

### 5.3 Bucketed Shuffle Join

```sql
-- 两张表同 bucket 数 + 同分桶列,可走 Shuffle/Bucketed Join
-- 避免数据网络传输,本地 bucket 直接 join
SELECT * FROM orders o JOIN users u ON o.user_id = u.id;
```

---

## 7. Colocation Join

### 7.1 概念

让两张表(或多张)的 bucket 在同一组 BE 上,join 时不跨节点:

```sql
CREATE TABLE `group1_orders` (
  order_id BIGINT,
  user_id BIGINT
)
UNIQUE KEY(order_id)
DISTRIBUTED BY HASH(user_id) BUCKETS 16
PROPERTIES (
  "colocate_with" = "user_bucket_group"
);

CREATE TABLE `group1_users` (
  user_id BIGINT,
  name VARCHAR(100)
)
UNIQUE KEY(user_id)
DISTRIBUTED BY HASH(user_id) BUCKETS 16
PROPERTIES (
  "colocate_with" = "user_bucket_group"
);
```

FE 把两表的同 bucket Tablet 调度到同一组 BE,join 时本地 hash join,无网络开销。

源码:`org.apache.doris.qe.ColocateJoinChecker`。

---

## 8. 实时写入

### 8.1 Stream Load

```bash
# code/doris/stream-load.sh
curl --location-trusted -u root: -X POST \
  http://fe-host:8030/api/mydb/orders/_stream_load \
  -H "Expect: 100-continue" \
  -H "column_separator:," \
  -H "columns: id, user_id, amount, dt" \
  -T /data/orders-2026-01-01.csv \
  -d '
{
  "timeout": 60,
  "max_filter_ratio": 0.1
}'
```

源码:`org.apache.doris.be.load.StreamLoadPlanner`。

### 8.2 Routine Load(从 Kafka)

```sql
CREATE ROUTINE LOAD mydb.kafka_orders ON orders
COLUMNS (id, user_id, amount, dt)
PROPERTIES (
  "desired_concurrent_number" = "5",
  "max_error_number" = "1000",
  "max_batch_interval" = "10",
  "max_batch_rows" = "50000"
)
FROM KAFKA (
  "kafka_broker_list" = "kafka:9092",
  "kafka_topic" = "orders",
  "property.kafka_default_offsets" = "OFFSET_BEGINNING"
);
```

源码:`org.apache.doris.load.routineload.RoutineLoadManager`。

### 8.3 Insert Into(批写)

```sql
INSERT INTO dws_orders SELECT
  dt,
  region,
  COUNT(DISTINCT user_id) AS users,
  SUM(amount) AS gmv
FROM orders
GROUP BY dt, region;
```

源码:`org.apache.doris.qe.InsertHandler`。

---

## 9. Adaptive Insert(Insert Into 自适应)

源码:`org.apache.doris.load.InsertIntoAdaptiveExecutor`

Doris 1.2+ 引入,针对大表 Insert Into 的优化:

```
   1. Nereids Planner 估算目标表大小
   2. 如果目标表 < 阈值(默认 5 GB),走单 BE Stream Load
   3. 否则按 bucket 分片 + 多 BE 并行 load
   4. 实时监测 load 速率,失败重试
```

```sql
SET enable_insert_strict = true;        -- 严格模式,失败回滚
SET enable_insert_adaptive = true;       -- 自适应开关(默认)
SET insert_adaptive_min_threshold = 5;   -- 单 BE 阈值(GB)
```

---

## 10. Join 策略

源码:`org.apache.doris.qe.StmtExecutor`

### 10.1 四种 Join

| Join 类型 | 触发条件 | 数据分布 |
| --- | --- | --- |
| Broadcast Hash Join | 一边 < 12 MB | 广播到所有 BE |
| Shuffle Hash Join | 一边小 + 分桶键 | hash 分发 |
| Bucketed Shuffle Join | 两表同 bucket + 分桶列 | 同 bucket 内 join |
| Colocation Join | 两表 colocation group | 完全本地 join |

### 10.2 选择逻辑

```scala
// 伪代码
def chooseJoinStrategy(left, right) = {
  if (left + right < 12 MB) BroadcastHashJoin
  else if (left.bucketCount == right.bucketCount && left.bucketKeys == right.bucketKeys)
    if (colocation) ColocationJoin
    else BucketedShuffleJoin
  else ShuffleHashJoin  // 默认
}
```

---

## 11. CBO 优化器

### 11.1 统计信息

```sql
-- 手动收集统计
ANALYZE TABLE orders;

-- 自动收集
SET enable_auto_analyze = true;
SET auto_analyze_threshold = 0.1;  -- 改动 10% 触发
```

源码:`org.apache.doris.statistics.StatisticsManager`。

### 11.2 CBO 规则

源码:`org.apache.doris.nereids.rules`

| 规则 | 作用 |
| --- | --- |
| `FilterReorder` | Filter 重排 |
| `JoinReorderDP` | 动态规划求最优 join |
| `AggregatePushDown` | 聚合下推 |
| `BucketJoinReorder` | Bucket join 选择 |
| `EliminateGroupBy` | 去除冗余 GROUP BY |

### 11.3 EXPLAIN CBO

```sql
EXPLAIN VERBOSE
SELECT * FROM orders o JOIN users u ON o.user_id = u.id;
```

输出:
```
HashJoin(Inner, [user_id])
   ├─ TableScan(orders, partitions=30, stats=[rowCount=10M, size=2GB])
   └─ TableScan(users, partitions=1, stats=[rowCount=1M, size=200MB])
```

---

## 12. 索引设计

### 12.1 表属性与索引

```sql
CREATE TABLE dwd_orders (
  id BIGINT,
  user_id BIGINT,
  amount DECIMAL(18, 2),
  status TINYINT,
  region VARCHAR(20),
  ts DATETIME
)
DUPLICATE KEY(id, ts)
PARTITION BY RANGE(ts) (
  PARTITION p202601 VALUES [("2026-01-01"), ("2026-02-01")),
  PARTITION p202602 VALUES [("2026-02-01"), ("2026-03-01"))
)
DISTRIBUTED BY HASH(id) BUCKETS 32
PROPERTIES (
  "bloom_filter_columns" = "user_id, region",
  "indexes" = "((region) USING BITMAP, (status) USING BITMAP)",
  "storage_medium" = "SSD",
  "storage_cooldown_time" = "2026-12-01 00:00:00"
);
```

### 12.2 索引选择

| 场景 | 索引 |
| --- | --- |
| 主键 / 排序键 | Sort Key |
| 高基数字段 | BloomFilter |
| 低基数等值查询 | Bitmap |
| 范围查询 | ZoneMap(自动) |
| 全文检索 | Inverted(2.x+) |
| 字符串前缀 | 前缀索引 |

---

## 13. 向量化执行

源码:`org.apache.doris.common.VectorizedUtil`

### 13.1 向量化原理

- **列存**:Operator 一次处理一列 Page。
- **SIMD**:CPU 一次性算 N 条数据(AVX-512 = 16 个 int32 / 8 个 int64)。
- **火山模型简化**:虚函数调用减少,CPU 缓存命中率高。

### 13.2 关键算子

源码:`org.apache.doris.exec.vectorized`

| 算子 | 作用 |
| --- | --- |
| `VScanner` | 表扫描,输出 Block |
| `VFilter` | WHERE |
| `VProject` | SELECT |
| `VAggregator` | GROUP BY |
| `VHashJoin` | JOIN |
| `VExchange` | 数据交换 |

---

## 14. 生产参数清单

`fe.conf`:

```properties
# FE 内存
JAVA_OPTS="-Xmx16g -Xms16g"
http_port=8030
rpc_port=9020
query_port=9030

# HA
edit_log_type=db
meta_dir=/data/doris-meta
```

`be.conf`:

```properties
# BE 内存
mem_limit=80%
be_port=9060
webserver_port=8040

# 存储
storage_root_path=/data1/doris,/data2/doris

# 线程
fragment_pool_thread_num=64
```

---

## 15. 生产实战任务

### 15.1 任务一:建表 + Stream Load

```bash
# code/doris/create-table-and-load.sh
mysql -hfe-host -P 9030 -uroot <<EOF
CREATE DATABASE IF NOT EXISTS mydb;
USE mydb;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT,
  user_id BIGINT,
  amount DECIMAL(18, 2),
  dt DATE
)
DUPLICATE KEY(id, dt)
PARTITION BY RANGE(dt) (
  PARTITION p202601 VALUES IN ('2026-01-01'),
  PARTITION p202602 VALUES IN ('2026-02-01')
)
DISTRIBUTED BY HASH(id) BUCKETS 32
PROPERTIES (
  "storage_medium" = "SSD",
  "bloom_filter_columns" = "user_id"
);
EOF

# Stream Load
curl --location-trusted -u root: -X POST \
  http://fe-host:8030/api/mydb/orders/_stream_load \
  -H "Expect: 100-continue" \
  -H "column_separator:," \
  -H "columns: id, user_id, amount, dt" \
  -T /data/orders-2026-01-01.csv
```

### 15.2 任务二:Colocation Join

```sql
-- 1. 用户表(维度)
CREATE TABLE dim_users (
  user_id BIGINT,
  name VARCHAR(100),
  city VARCHAR(50)
)
UNIQUE KEY(user_id)
DISTRIBUTED BY HASH(user_id) BUCKETS 16
PROPERTIES ("colocate_with" = "user_bucket_group");

-- 2. 订单表(事实)
CREATE TABLE dwd_orders (
  order_id BIGINT,
  user_id BIGINT,
  amount DECIMAL(18, 2)
)
DUPLICATE KEY(order_id)
DISTRIBUTED BY HASH(user_id) BUCKETS 16
PROPERTIES ("colocate_with" = "user_bucket_group");

-- 3. 启用 Colocation
ADMIN SET FRONTEND CONFIG ("enable_colocation_join" = "true");

-- 4. 看 plan
EXPLAIN SELECT * FROM dwd_orders o JOIN dim_users u ON o.user_id = u.id;
```

### 15.3 任务三:Bucketed Shuffle Join

```sql
CREATE TABLE t1 (
  id BIGINT,
  payload VARCHAR(100)
)
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 32;

CREATE TABLE t2 (
  id BIGINT,
  payload VARCHAR(100)
)
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 32;  -- 同样 32 个 bucket

-- 自动走 Bucketed Shuffle Join
SELECT * FROM t1 JOIN t2 ON t1.id = t2.id;
```

### 15.4 任务四:Routine Load

```sql
CREATE ROUTINE LOAD mydb.kafka_orders ON orders
COLUMNS (id, user_id, amount, dt)
PROPERTIES (
  "desired_concurrent_number" = "5"
)
FROM KAFKA (
  "kafka_broker_list" = "kafka:9092",
  "kafka_topic" = "orders",
  "property.kafka_default_offsets" = "OFFSET_BEGINNING"
);

-- 监控
SHOW ROUTINE LOAD\G
SHOW ALL ROUTINE LOAD FROM mydb;
```

### 15.5 任务五:Adaptive Insert Into

```sql
SET enable_insert_adaptive = true;
SET insert_adaptive_min_threshold = 5;

INSERT INTO dws_orders
SELECT
  dt,
  region,
  COUNT(DISTINCT user_id),
  SUM(amount)
FROM orders
GROUP BY dt, region;

-- 看 metrics
SHOW BACKENDS;
SHOW TABLET FROM mydb.orders;
```

---

## 16. 专家面试题

1. **Doris 和 StarRocks 的关系?**
   *要点*:StarRocks 是 Doris 1.x 的 fork(2020 年),StarRocks 在 CBO / 向量化 / Colocation Join 上更激进;Doris 后来合并部分特性(Nereids)。
2. **FE 和 BE 各做什么?**
   *要点*:FE 接收 SQL、解析、优化、调度、元数据;BE 存数据 + 执行 PlanFragment。FE 无状态(数据走 BDBJE),BE 有 Tablet 副本。
3. **Tablet 是什么?**
   *要点*:数据分片,默认 256 MB 一 Segment,多个 Segment 一个 Tablet,多副本(默认 3)。FE 调度 Tablet 到 BE。
4. **Doris 三种表模型?**
   *要点*:DUPLICATE(原始日志) / UNIQUE(主键 upsert) / AGGREGATE(指标聚合)。表模型决定写入语义。
5. **Colocation Join 怎么实现?**
   *要点*:两表同 colocation_with + 同 bucket 数 + 同分桶键,FE 把同 bucket Tablet 调度到同一组 BE,join 时本地。
6. **Bucketed Shuffle Join 与 Colocation Join 区别?**
   *要点*:Colocation 持续生效(无论 join key);Bucketed Shuffle 仅对相同分桶键的 join 生效,要求 bucket 数 + key 一致。
7. **Bitmap Index 的限制?**
   *要点*:低基数列(≤1 万);高基数列建 Bitmap 会膨胀,反而慢。
8. **Insert Into 自适应优化什么?**
   *要点*:大表 Insert Into 时,自动切分 BE + 并行 load,避免单点压力;`enable_insert_adaptive=true`。
9. **Stream Load 的吞吐瓶颈?**
   *要点*:HTTP 单 connection 默认 10MB/s;高吞吐场景用多 connection + 压缩。生产可达 100 MB/s / connection。
10. **Doris 为何选择 MySQL 协议?**
    *要点*:MySQL 生态成熟,JDBC / Proxy / BI 工具直接复用;协议层 FE 解析 → 转 BE RPC。
11. **Nereids CBO 与 RBO 区别?**
    *要点*:RBO 基于规则(下推、重排);CBO 基于代价(join 顺序、聚合策略)。Nereids 是 Cascades 框架的 CBO。
12. **向量化 vs 火山模型?**
    *要点*:向量化一次处理一列 Page,SIMD + CPU cache 友好;火山模型每行一次虚函数,cache miss 严重。
13. **Doris 的副本如何修复?**
    *要点*:BE 心跳上报 Tablet 状态,FE TabletScheduler 检测到副本丢失后调度其他 BE 补副本(`CLONE` task)。
14. **Doris 与 ClickHouse 的对比?**
    *要点*:Doris MySQL 协议 + 实时写入 + 高并发;ClickHouse 列存极致 + 大宽表聚合;Doris 偏实时数仓,ClickHouse 偏日志分析。
15. **FE HA 怎么做?**
    *要点*:BDBJE(ZAB 类协议)做元数据同步,Follower / Observer 多节点,Leader 选举,读可扩展到 Observer。

---

## 17. 一张图回顾 Doris 架构

```
                       ┌────────────────────────────┐
                       │       MySQL Client         │
                       │  (JDBC / BI / CLI)         │
                       └─────────────┬──────────────┘
                                     │ MySQL Protocol
                       ┌─────────────▼──────────────┐
                       │       FE (Frontend)        │
                       │  ┌──────────────────────┐  │
                       │  │ NereidsPlanner (CBO) │  │
                       │  │ - Cascades            │  │
                       │  │ - Cost Model          │  │
                       │  └──────────────────────┘  │
                       │  ┌──────────────────────┐  │
                       │  │ TabletScheduler       │  │
                       │  └──────────────────────┘  │
                       └─────────────┬──────────────┘
                                     │ BRPC
            ┌────────────────────────┼────────────────────────┐
            ▼                        ▼                        ▼
      ┌───────────┐           ┌───────────┐           ┌───────────┐
      │   BE 1    │           │   BE 2    │   ...     │   BE N    │
      │ ┌───────┐ │           │ ┌───────┐ │           │ ┌───────┐ │
      │ │Tablet1│ │           │ │Tablet1│ │           │ │Tablet1│ │
      │ │Tablet2│ │           │ │Tablet2│ │           │ │Tablet2│ │
      │ │   ... │ │           │ │   ... │ │           │ │   ... │ │
      │ └───────┘ │           │ └───────┘ │           │ └───────┘ │
      │ Pipeline   │           │ Pipeline   │           │ Pipeline   │
      │ Vectorized │           │ Vectorized │           │ Vectorized │
      └───────────┘           └───────────┘           └───────────┘
            │                        │                        │
            └────────────────────────┴────────────────────────┘
                                     │
                              HDFS / S3 / 本地盘
```

---

## 18. 小结与下一章预告

- Doris / StarRocks = FE(CBO + 调度) + BE(向量化 + Pipeline 执行) + Tablet(副本) + 多种表模型。
- Colocation Join / Bucketed Shuffle Join / Bitmap Index 是大表 join 与快速查询的关键。
- 下一章 [11-ClickHouse 原理与生产实践],我们进入 ClickHouse:MergeTree 引擎族、PARTITION / ORDER BY、ReplacingMergeTree、Projection、Materialized View、向量计算。