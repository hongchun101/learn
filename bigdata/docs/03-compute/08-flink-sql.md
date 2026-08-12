# 08. Flink SQL 与流批一体

> **本章定位**:Flink SQL 是 Flink 在 1.x → 2.x 的最大变革,通过 Dynamic Table + RelNode + 流批同构 Runtime,把"流批一体"从口号变成了工程现实。本章深入 Dynamic Table 模型、Retraction、MiniBatch、Local-Global、Lookup Join 等关键概念。

---

## 1. Flink SQL 三大支柱

```
              ┌─────────────────────────────────────────────┐
              │        Flink SQL 三大支柱                    │
              ├─────────────────┬──────────────┬─────────────┤
              │  Dynamic Table  │   Retraction │  流批同构    │
              │  流式表模型       │   撤回机制    │   Runtime   │
              ├─────────────────┴──────────────┴─────────────┤
              │         Planner(Blink/Flink Planner)          │
              │         RelNode + Optimizer + Codegen         │
              └─────────────────────────────────────────────┘
```

---

## 2. Dynamic Table(动态表)

### 2.1 概念

传统关系数据库的"表"是"快照"——查询时返回当前状态。Dynamic Table 是"流"——查询返回随时间变化的视图。

源码:`org.apache.flink.table.api.Table`(逻辑表) + `DynamicTableSource` / `DynamicTableSink`(物理实现)。

### 2.2 持续查询(Continuous Query)

```sql
-- 流式查询:每次有新数据都重新计算
SELECT user_id, SUM(amount) AS gmv
FROM orders
GROUP BY user_id;
```

输出也是"流":每次有 orders 新增,gmv 输出更新(增量或全量)。

### 2.3 Dynamic Table 与流/批的对应

| 模式 | 输入 | 输出 |
| --- | --- | --- |
| Stream(流模式) | 动态变化的输入流 | 持续产出的 changelog |
| Batch(批模式) | 静态数据集 | 一次性结果集 |

**关键点**:同一份 SQL,流模式持续跑,批模式一次跑完,Runtime 完全相同。

源码:`org.apache.flink.table.runtime.operators.dynamicproc.DynamicProcConverter`。

---

## 3. Retraction(撤回)

### 3.1 为什么需要 Retraction

流式聚合的输出不是"增量 +1",而是"更新"。下游收到新数据,旧值要撤回:

```
   原始流:
     ('alice', 100)
     ('bob', 50)
     ('alice', 200)
   
   流式聚合(SUM):
     ('alice', 100)      ← 初始
     ('bob', 50)
     ('alice', -100, +200)  ← 撤回旧 alice=100,新增 alice=200
     ('alice', 200)      ← 新结果
```

Retraction = 两条流:`+U`(update)和 `-U`(retract)。下游根据主键决定是覆盖还是累加。

### 3.2 Retraction 触发条件

源码:`org.apache.flink.streaming.api.datastream.utils.RetractableStream` 的判断:

| SQL 类型 | 产生 Retraction? |
| --- | --- |
| `SELECT` 无聚合 + 无去重 | 否(纯转发) |
| `GROUP BY` 聚合 | 是 |
| `DISTINCT` | 是 |
| `OVER` 窗口 | 视情况 |
| Top-N | 是 |

### 3.3 启用 Retraction

```sql
SET table.exec.emit.early-fire.enabled = true;
SET table.exec.emit.late-fire.enabled = true;

-- 或者在代码中
tableEnv.getConfig.set("table.exec.emit.early-fire.enabled", "true")
```

源码:`org.apache.flink.table.runtime.operators.aggregate.GroupAggFunction`。

---

## 4. 流批一体 SQL

### 4.1 同语法不同 Runtime

```sql
-- 这段 SQL 同时能在流/批跑
SELECT
  TUMBLE_START(ts, INTERVAL '1' MINUTE) AS window_start,
  user_id,
  SUM(amount) AS gmv
FROM orders
GROUP BY TUMBLE(ts, INTERVAL '1' MINUTE), user_id;
```

- **流模式**:TUMBLE 是 Tumble Window,持续产出。
- **批模式**:TUMBLE 是 Group By 时间字段,一次产出。

### 4.2 Runtime 切换

源码:`org.apache.flink.table.api.config.ExecutionConfigOptions`

```properties
# 流模式
execution.runtime-mode = streaming

# 批模式
execution.runtime-mode = batch

# 自动
execution.runtime-mode = automatic
```

`automatic` 模式下,Flink Planner 根据 Source 类型自动判断(无界 → streaming,有界 → batch)。

### 4.3 Planner 选择

源码:`org.apache.flink.table.api.internal.TableEnvironmentImpl#createPlanner`

```scala
// 1. Blink Planner(Flink 1.11+ 推荐)
val settings = EnvironmentSettings.newInstance()
  .useBlinkPlanner()
  .inStreamingMode()
  .build()
val tableEnv = TableEnvironment.create(settings)

// 2. Flink Planner(老版本,将被淘汰)
val settings = EnvironmentSettings.newInstance()
  .useOldPlanner()
  .build()
```

---

## 5. MiniBatch 与 Local-Global 聚合

### 5.1 MiniBatch(微批聚合)

源码:`org.apache.flink.table.runtime.operators.aggregate.MiniBatchAggregateOperator`

**问题**:流式聚合每来一条都触发一次聚合,高频数据下 OOM + 状态膨胀。
**解法**:攒一批数据后一次性聚合,中间状态预先合并。

```sql
SET table.exec.mini-batch.enabled = true;
SET table.exec.mini-batch.allow-latency = 5s;       -- 攒批延迟
SET table.exec.mini-batch.size = 5000;             -- 攒批条数
```

源码:`MiniBatchEnabled` 元数据 → `MiniBatchAggregateFunction`。

### 5.2 Local-Global 聚合

源码:`org.apache.flink.table.runtime.operators.aggregate.LocalGlobalAggregateOperator`

**问题**:大状态聚合,数据全部 hash 到一个 operator,单点 OOM。
**解法**:**两阶段聚合**(类似 Spark 两阶段 reduceByKey):

```
   输入 → Local 聚合(各 SubTask 局部聚合,reduce state)
        → shuffle by key
        → Global 聚合(各 SubTask 全局聚合)
```

```sql
SET table.optimizer.agg-phase-strategy = TWO_PHASE;

-- 自动启用
SET table.optimizer.distinct-agg.split.enabled = true;
SET table.optimizer.distinct-agg.split.bucket-num = 1024;
```

源码:`StreamPhysicalGroupAggregateRule`(Blink Planner Rule)。

---

## 6. Lookup Join(维表 Join)

### 6.1 概念

流式 join 维表(维度表):

```sql
SELECT
  o.order_id,
  o.amount,
  u.user_name
FROM orders o
LEFT JOIN users FOR SYSTEM_TIME AS OF o.proc_time AS u
ON o.user_id = u.id;
```

`FOR SYSTEM_TIME AS OF`:每条 orders 都按当前时间点 join users 表的快照。

### 6.2 Lookup Join 源码

源码:`org.apache.flink.table.runtime.operators.join.LookupJoinRunner`

```scala
// 1. 维表 source:支持 HBase / MySQL / Redis / Hive 等
// 2. 每条流数据触发 join 时,查维表获取当前值
// 3. 缓存(cache)避免每次都查
```

### 6.3 Lookup Join 缓存策略

源码:`org.apache.flink.table.connector.source.LookupCache`

```sql
SET table.exec.async-lookup.enabled = true;       -- 异步查
SET table.exec.async-lookup.buffer-capacity = 100;
SET table.exec.lookup.async-cache.enabled = true; -- 异步缓存
```

维表 Connector:
- `flink-connector-jdbc`:MySQL / PostgreSQL。
- `flink-connector-redis`:Redis(同步 / 异步)。
- `flink-connector-hbase`:HBase(异步)。
- `flink-connector-hudi`:Hudi 表。

### 6.4 实战案例:订单流 Join 用户维表

```scala
import org.apache.flink.streaming.api.scala._
import org.apache.flink.table.api._
import org.apache.flink.table.api.bridge.scala._
import org.apache.flink.connector.jdbc.table.JdbcDynamicTableSource

// 1. 注册 JDBC 维表
tableEnv.executeSql("""
  CREATE TABLE users (
    id BIGINT,
    name STRING,
    city STRING,
    PRIMARY KEY (id) NOT ENFORCED
  ) WITH (
    'connector' = 'jdbc',
    'url' = 'jdbc:mysql://mysql-host:3306/mydb',
    'table-name' = 'users',
    'username' = 'root',
    'password' = 'password',
    'lookup.cache.max-rows' = '100000',
    'lookup.cache.ttl' = '60s'
  )
""")

// 2. 注册 Kafka 源表
tableEnv.executeSql("""
  CREATE TABLE orders (
    order_id STRING,
    user_id BIGINT,
    amount DECIMAL(10, 2),
    ts TIMESTAMP(3),
    WATERMARK FOR ts AS ts - INTERVAL '5' SECOND
  ) WITH (
    'connector' = 'kafka',
    'topic' = 'orders',
    'bootstrap.servers' = 'kafka:9092',
    'format' = 'json'
  )
""")

// 3. 写 SQL
tableEnv.executeSql("""
  INSERT INTO ods_orders_user
  SELECT
    o.order_id,
    o.amount,
    u.name AS user_name,
    u.city AS user_city,
    o.ts
  FROM orders o
  LEFT JOIN users FOR SYSTEM_TIME AS OF o.proc_time AS u
  ON o.user_id = u.id
""")
```

---

## 7. Mini-Batch 完整示例

### 7.1 配置参数

```properties
# 启用 MiniBatch
table.exec.mini-batch.enabled = true
table.exec.mini-batch.allow-latency = 5s
table.exec.mini-batch.size = 5000

# 启用 Local-Global
table.optimizer.agg-phase-strategy = TWO_PHASE
table.optimizer.distinct-agg.split.enabled = true
```

### 7.2 聚合 SQL

```sql
-- 高频 PV/UV
SELECT
  TUMBLE_START(ts, INTERVAL '1' MINUTE) AS win_start,
  page,
  COUNT(*) AS pv,
  COUNT(DISTINCT user_id) AS uv
FROM pageviews
GROUP BY TUMBLE(ts, INTERVAL '1' MINUTE), page;
```

源码:`StreamPhysicalGroupAggregateRule` → `LocalGlobalAggregateOperator`。

---

## 8. Flink Planner 内部结构

### 8.1 Blink Planner(Rule-Based + Cost-Based)

```
   ┌──────────────────────────────┐
   │        SQL Parser            │   (Apache Calcite)
   ├──────────────────────────────┤
   │  Logical Plan (RelNode)      │   (优化器)
   ├──────────────────────────────┤
   │  Optimized Logical Plan      │   (RBO + CBO)
   ├──────────────────────────────┤
   │  StreamPhysical Rel / ExecNode │  (物理算子)
   ├──────────────────────────────┤
   │  Transformation DAG          │   (DataStream API)
   ├──────────────────────────────┤
   │  Streaming JobGraph          │   (执行)
   └──────────────────────────────┘
```

### 8.2 优化器规则

源码:`org.apache.flink.table.planner.plan.rules.physical.stream`

| 规则 | 作用 |
| --- | --- |
| `StreamPhysicalGroupAggregateRule` | 聚合下推 + MiniBatch + Local-Global |
| `StreamPhysicalJoinRule` | Join 策略选择(Broadcast / Lookup / SortMerge) |
| `StreamPhysicalCalcRule` | Calc 投影下推 |
| `StreamPhysicalExchangeRule` | Exchange(Shuffle)插入 |
| `StreamPhysicalWatermarkRule` | Watermark 注入 |

源码:`CalciteRuleSets.PHYSICAL_OPT_RULES`。

---

## 9. 窗口函数(Window)

### 9.1 三大窗口

```sql
-- Tumble(滚动)
TUMBLE(ts, INTERVAL '1' MINUTE)

-- Hop(滑动)
HOP(ts, INTERVAL '1' MINUTE, INTERVAL '5' MINUTE)

-- Session(会话)
SESSION(ts, INTERVAL '5' MINUTE)
```

源码:`org.apache.flink.table.expressions.WindowReference` + `Tumble` / `Hop` / `Session` 算子。

### 9.2 Over 窗口

```sql
SELECT
  user_id,
  amount,
  SUM(amount) OVER (
    PARTITION BY user_id
    ORDER BY ts
    RANGE BETWEEN INTERVAL '5' MINUTE PRECEDING AND CURRENT ROW
  ) AS moving_sum
FROM orders;
```

### 9.3 时间属性

- **事件时间(EventTime)**:用 `WATERMARK FOR ts AS ts - INTERVAL '5' SECOND` 声明。
- **处理时间(ProcessingTime)**:用 `proc_time()` 函数。

源码:`org.apache.flink.table.api.DataTypes`。

---

## 10. 状态一致性

### 10.1 Retraction 与 Exactly-Once

```sql
SET table.exec.sink.not-null-enforcer = drop;
SET pipeline.required-local-pre-checkpoint-mode = exactly_once;
```

### 10.2 两阶段 Sink

```sql
-- Kafka 两阶段 sink
INSERT INTO kafka_topic
SELECT * FROM source;
```

源码:`TwoPhaseCommittingSink`(Flink Kafka Producer / Doris Sink)。

---

## 11. Connector 生态

### 11.1 Source

| Connector | 类型 | 关键特性 |
| --- | --- | --- |
| Kafka | 流 | Offset 持久化 + 分区 + Exactly-Once |
| MySQL CDC | 流 | Debezium + 全量/增量 |
| Pulsar | 流 | 主题路由 + 多订阅模式 |
| Filesystem | 批/流 | Parquet/ORC/CSV |
| Hive | 批 | MetaStore + 离线表 |
| Iceberg | 批/流 | 湖格式 + Time Travel |
| Hudi | 批/流 | 湖格式 + Copy-on-Write |
| Paimon | 批/流 | Flink 原生湖格式 |

### 11.2 Sink

| Connector | 关键特性 |
| --- | --- |
| Kafka | Exactly-Once + TwoPhaseCommit |
| Doris | Stream Load + 内存 buffer |
| Iceberg | 事务 + 时间旅行 |
| Hive | 静态分区写入 |
| MySQL JDBC | 批写 + 幂等 upsert |
| HBase | 异步 + 批量写入 |

---

## 12. 生产参数清单

`flink-conf.yaml`:

```yaml
# Planner
table.exec.resource.default-parallelism: 4
table.exec.mini-batch.enabled: true
table.exec.mini-batch.allow-latency: 5s
table.exec.mini-batch.size: 5000

# State
state.backend: rocksdb
state.backend.incremental: true

# Checkpoint
execution.checkpointing.interval: 60s
execution.checkpointing.mode: EXACTLY_ONCE

# Time
table.local-time-zone: Asia/Shanghai

# SQL
table.exec.async-lookup.enabled: true
table.exec.async-lookup.buffer-capacity: 100
table.exec.lookup.async-cache.enabled: true

# Agg
table.optimizer.agg-phase-strategy: TWO_PHASE
table.optimizer.distinct-agg.split.enabled: true
table.optimizer.distinct-agg.split.bucket-num: 1024
```

---

## 13. 生产实战任务

### 13.1 任务一:Kafka → Doris 实时数仓

```scala
// code/flink/sql-kafka-to-doris.scala
import org.apache.flink.streaming.api.scala._
import org.apache.flink.table.api._
import org.apache.flink.table.api.bridge.scala._

val tEnv = TableEnvironment.create(
  EnvironmentSettings.newInstance()
    .useBlinkPlanner()
    .inStreamingMode()
    .build()
)

tEnv.executeSql("""
  CREATE TABLE orders_kafka (
    order_id STRING,
    user_id BIGINT,
    amount DECIMAL(10, 2),
    ts TIMESTAMP(3),
    WATERMARK FOR ts AS ts - INTERVAL '5' SECOND
  ) WITH (
    'connector' = 'kafka',
    'topic' = 'orders',
    'properties.bootstrap.servers' = 'kafka:9092',
    'properties.group.id' = 'flink-sql',
    'format' = 'json'
  )
""")

tEnv.executeSql("""
  CREATE TABLE dws_orders_gmv (
    win_start TIMESTAMP(3),
    win_end TIMESTAMP(3),
    gmv DECIMAL(20, 2),
    order_cnt BIGINT
  ) WITH (
    'connector' = 'doris',
    'fenodes' = 'doris-fe:8030',
    'table.identifier' = 'mydb.dws_orders_gmv',
    'username' = 'root',
    'password' = ''
  )
""")

tEnv.executeSql("""
  INSERT INTO dws_orders_gmv
  SELECT
    TUMBLE_START(ts, INTERVAL '1' MINUTE) AS win_start,
    TUMBLE_END(ts, INTERVAL '1' MINUTE) AS win_end,
    SUM(amount) AS gmv,
    COUNT(*) AS order_cnt
  FROM orders_kafka
  GROUP BY TUMBLE(ts, INTERVAL '1' MINUTE)
""")
```

### 13.2 任务二:Lookup Join + Redis 维表

```scala
tEnv.executeSql("""
  CREATE TABLE redis_dim (
    user_id BIGINT,
    name STRING,
    vip_level STRING
  ) WITH (
    'connector' = 'redis',
    'host' = 'redis-host',
    'port' = '6379',
    'lookup.cache.max-rows' = '50000',
    'lookup.cache.ttl' = '60s'
  )
""")

tEnv.executeSql("""
  INSERT INTO dws_orders_user
  SELECT
    o.order_id,
    o.amount,
    r.name,
    r.vip_level
  FROM orders_kafka o
  LEFT JOIN redis_dim FOR SYSTEM_TIME AS OF o.proc_time AS r
  ON o.user_id = r.user_id
""")
```

### 13.3 任务三:Mini-Batch + Local-Global 聚合

```scala
// 配置
tEnv.getConfig.set("table.exec.mini-batch.enabled", "true")
tEnv.getConfig.set("table.exec.mini-batch.allow-latency", "5s")
tEnv.getConfig.set("table.exec.mini-batch.size", "5000")
tEnv.getConfig.set("table.optimizer.agg-phase-strategy", "TWO_PHASE")

// 写高频 PV/UV
tEnv.executeSql("""
  CREATE VIEW pageview_uv AS
  SELECT
    TUMBLE_START(ts, INTERVAL '1' MINUTE) AS win_start,
    page,
    COUNT(*) AS pv,
    COUNT(DISTINCT user_id) AS uv
  FROM pageviews_kafka
  GROUP BY TUMBLE(ts, INTERVAL '1' MINUTE), page
""")
```

### 13.4 任务四:流批同 SQL

```scala
// 1. 流模式(streaming)
val streamSettings = EnvironmentSettings.newInstance()
  .useBlinkPlanner()
  .inStreamingMode()
  .build()

// 2. 批模式(batch)  
val batchSettings = EnvironmentSettings.newInstance()
  .useBlinkPlanner()
  .inBatchMode()
  .build()

// 同 SQL 切换
val gmvQuery = """
  SELECT user_id, SUM(amount) AS gmv
  FROM orders
  GROUP BY user_id
"""

// 流模式持续输出
val tStreamEnv = TableEnvironment.create(streamSettings)
val streamResult = tStreamEnv.sqlQuery(gmvQuery)
streamResult.toAppendStream[Row].print()

// 批模式一次性输出
val tBatchEnv = TableEnvironment.create(batchSettings)
val batchResult = tBatchEnv.sqlQuery(gmvQuery)
batchResult.toDataStream[Row].print()
```

### 13.5 任务五:Iceberg 湖格式写入

```scala
tEnv.executeSql("""
  CREATE CATALOG iceberg WITH (
    'type' = 'iceberg',
    'catalog-type' = 'hadoop',
    'warehouse' = 'hdfs:///iceberg/warehouse'
  )
""")

tEnv.executeSql("""
  USE iceberg.mydb
""")

tEnv.executeSql("""
  CREATE TABLE IF NOT EXISTS orders_iceberg (
    order_id STRING,
    user_id BIGINT,
    amount DECIMAL(10, 2),
    ts TIMESTAMP
  ) PARTITIONED BY (days(ts))
""")

tEnv.executeSql("""
  INSERT INTO orders_iceberg
  SELECT * FROM default_catalog.mydb.orders_kafka
""")
```

---

## 14. 专家面试题

1. **Dynamic Table 和传统表区别?**
   *要点*:传统表是"快照",查询返回当前状态;Dynamic Table 是"流",查询返回持续变化的视图(Changelog)。
2. **Retraction 触发条件?**
   *要点*:聚合(`GROUP BY`)、`DISTINCT`、Top-N、`OVER` 部分场景;其他纯转发不产生 retraction。
3. **MiniBatch 与 Local-Global 的区别?**
   *要点*:MiniBatch 攒批后单次聚合,降低状态访问频率;Local-Global 是两阶段聚合,降低单点状态。两者可叠加。
4. **流批一体的 Runtime 切换?**
   *要点*:同一份 SQL 配合 `ExecutionEnvironmentSettings.inStreamingMode/inBatchMode`,Runtime 切换不需改 SQL。
5. **Lookup Join 缓存策略?**
   *要点*:LRU 缓存,`lookup.cache.max-rows` + `lookup.cache.ttl`;异步查 `async-lookup.enabled=true`。
6. **Flink Planner 与 Blink Planner 区别?**
   *要点*:Blink 基于 Apache Calcite,完整 RBO + CBO,推荐使用;老 Planner 已废弃。
7. **Mini-Batch 与 Late Firing 区别?**
   *要点*:MiniBatch 在窗口触发前攒批,延迟可控;Late Firing 在 watermark 后触发,减少 retract。
8. **为什么流式聚合要 Two-Phase?**
   *要点*:Local 阶段把数据先局部聚合,reduce 状态量;Global 阶段聚合最终结果。`table.optimizer.agg-phase-strategy=TWO_PHASE`。
9. **OVER 窗口与 GROUP BY 聚合区别?**
   *要点*:OVER 是基于排序的窗口函数(per-row 计算);GROUP BY 是基于分组的聚合(per-group 输出)。
10. **Flink SQL 如何保证 Exactly-Once?**
    *要点*:两阶段 sink(`TwoPhaseCommittingSink`) + Checkpoint + barrier 对齐。下游 sink 必须支持事务(Kafka/Doris)。
11. **Count(DISTINCT) 为什么慢?**
    *要点*:Distinct 状态不能直接 reduce,需要 HashSet;MiniBatch + Local-Global 拆分,Local 去重,Global 再次去重。
12. **流批一体的局限性?**
    *要点*:流模式不能完全复用 Hive UDF;某些批优化(如 Sort-Merge Shuffle)只在批模式生效;UDF 实现需注意运行时差异。
13. **Tumble / Hop / Session 窗口的区别?**
    *要点*:Tumble 固定大小不重叠;Hop 固定大小可重叠(滑动);Session 空闲间隔触发窗口(动态大小)。
14. **Flink SQL Catalog 是干什么的?**
    *要点*:管理元数据(库、表、UDF),Flink 1.13+ 统一 `CatalogV2` API,支持 Hive / Iceberg / Paimon / Gravitino 等。

---

## 15. 一张图回顾 Flink SQL 全景

```
   Flink SQL
       │
       ├─ Planner
       │   ├─ Parser (Calcite)
       │   ├─ Logical Optimizer (RBO + CBO)
       │   ├─ Physical Planner
       │   └─ Codegen (Janino)
       │
       ├─ Runtime
       │   ├─ Stream (流模式)
       │   ├─ Batch (批模式)
       │   └─ Stream → Batch (自动)
       │
       ├─ Dynamic Table
       │   ├─ Retraction (撤回流)
       │   ├─ Mini-Batch
       │   ├─ Local-Global
       │   └─ Late Firing
       │
       ├─ Window
       │   ├─ Tumble
       │   ├─ Hop
       │   ├─ Session
       │   └─ OVER
       │
       ├─ Join
       │   ├─ Lookup Join (维表)
       │   ├─ Broadcast Join
       │   ├─ Sort Merge Join
       │   └─ Temporal Join
       │
       └─ Catalog / Connector
           ├─ Kafka / Pulsar / MySQL CDC
           ├─ Iceberg / Hudi / Paimon
           ├─ Doris / ClickHouse / Hive
           └─ JDBC / HBase / Redis
```

---

## 16. 小结与下一章预告

- Flink SQL = Dynamic Table(模型) + Retraction(撤回) + 流批同构 Runtime。
- MiniBatch + Local-Global + Lookup Join 是 Flink SQL 高频面试考点。
- 下一章 [09-Presto/Trino 原理与 MPP 引擎],我们进入联邦查询引擎的代表:Coordinator/Worker、Connector SPI、Page 模型、Operator Pipeline、Hive Connector。