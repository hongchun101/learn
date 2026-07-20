# Module 14 · OLAP 引擎架构与选型

> 这一章回答"为什么有这么多 OLAP 引擎、它们各自适合什么场景、怎样选型"。
> 所有 demo 仍然跑在 DuckDB 上（in-memory，无集群），但每条 SQL 都对应
> 到 Trino / ClickHouse / Doris / StarRocks 在生产环境里的实现思路。

读完这一章你能：

- 区分 **MPP 引擎**（Trino/Presto）、**列存单节点引擎**（ClickHouse）、
  **国产 MPP+向量化的全场景引擎**（Doris、StarRocks）
- 说出每款引擎的 **存储格式、查询优化器、执行模型** 关键差异
- 在 5 类典型 OLAP 查询模式（高基数 GROUP-BY、Top-N、近似去重、
  窗口函数、多表 JOIN）下写出对应的方言 SQL
- 用一份基准 SQL 同时验证 4 款引擎的等价性（针对同一份 demo 数据）
- 给出 **"什么场景选什么引擎"** 的决策表

## 章节

- [ch01 · OLAP 引擎分类](#ch01--olap-引擎分类)
- [ch02 · Trino 架构](#ch02--trino-架构)
- [ch03 · ClickHouse 架构](#ch03--clickhouse-架构)
- [ch04 · Doris 架构](#ch04--doris-架构)
- [ch05 · StarRocks 架构](#ch05--starrocks-架构)
- [ch06 · 选型对比](#ch06--选型对比)
- [ch07 · 性能基准与基准 SQL 模板](#ch07--性能基准与基准-sql-模板)
- [ch08 · 真实案例与反模式](#ch08--真实案例与反模式)

## 快速开始

```bash
# 1. 生成 demo 数据
python shared/generate_data.py --scale small

# 2. 跑本章的 5 类 OLAP 查询基准
pytest modules/14-olap/tests/ -v
```

SQL 入口：[`src/olap_demo.sql`](src/olap_demo.sql)，5 类查询模式都有完整
的 DuckDB 实现，注释里逐条对照 4 款引擎的实现差异。

---

## ch01 · OLAP 引擎分类

OLAP 引擎可以按 **执行模型** 粗分为三类：

| 类别 | 代表 | 特点 |
|---|---|---|
| **MPP + 协调节点 + worker** | Trino (PrestoSQL)、StarRocks、Doris | 多节点并行，shared-nothing，scale out |
| **单机列存 + 副本 + 分布式表** | ClickHouse | 单机向量化 + 副本组成集群，没有真正的协调节点 |
| **Lakehouse 上的查询引擎** | Trino over Iceberg/Hudi、StarRocks over Hive Catalog | 在开放表格式上做查询 |

再按 **存储与优化器组合** 看一张矩阵：

```
                存储                  优化器              执行模型
─────────────────────────────────────────────────────────────────────
Trino          Hive/Iceberg/Hudi    CBO + cost-based     push-based MPP
ClickHouse     自研 MergeTree       Rules + statistics   pull-based vector
Doris          自研 + segment       CBO + statistics     push-based MPP + colocated
StarRocks      自研 + 主键表        CBO + statistics     push-based MPP + colocated
```

选型的**第一步**不是看 benchmark，而是回答三个问题：

1. **数据量**：单表 < 1TB 还是 > 100TB？
2. **查询形态**：adhoc 探索多，还是固定报表多？
3. **写入形态**：批量 + 一天一次，还是高 QPS 实时写入？

回答清楚了，剩下就是 OLAP 引擎各自的强项比对。

---

## ch02 · Trino 架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Client (JDBC/CLI/BI)                                             │
└───────────────────────────────┬──────────────────────────────────┘
                                │  HTTP/Thrift
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Coordinator ── 解析 → 优化 → 调度 → 聚合 final 结果              │
│  (单点, stateless)                                              │
└───────────────────────────────┬──────────────────────────────────┘
                                │  REST + serializable plan
                                ▼
┌────────────┬────────────┬────────────┬────────────┐
│  Worker-1  │  Worker-2  │  Worker-3  │  Worker-N  │
│  (task)    │  (task)    │  (task)    │  (task)    │
│  scan+agg  │  scan+agg  │  scan+agg  │  scan+agg  │
└────────────┴────────────┴────────────┴────────────┘
                                ▲
                                │  catalog (Hive / Iceberg / MySQL / ...)
```

**关键点：**

- **Coordinator 只做调度**，所有计算下沉到 Worker；Coordinator 挂了新起一个即可。
- **Pipeline 调度**：每个 Stage 被切成多个 task，并发由 `task.concurrency` 控。
- **Connector 架构**：Trino 不"拥有"数据，通过 connector 拉到任何存储（Hive、
  Iceberg、MySQL、Kafka、MongoDB...），这是它"联邦查询"口碑的来源。
- **运行时过滤 (Runtime Filter)**：在 hash-join build 阶段，把 probe 侧的过滤
  条件反向 push 到 scan 端，是 Trino 相比 Spark 3 的"核心加速器"。

```sql
-- 同一份 SQL 在 Trino / DuckDB 都可以跑（无方言差异）
SELECT user_id, SUM(total)
FROM hive.warehouse.orders
WHERE dt BETWEEN DATE '2024-01-01' AND DATE '2024-01-31'
GROUP BY user_id;
```

---

## ch03 · ClickHouse 架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Client                                                           │
└────────────┬─────────────────────────────────────────────────────┘
             │  TCP / HTTP
             ▼
┌──────────────────────────────────────────────────────────────────┐
│  clickhouse-server (单进程内多线程)                                │
│  ─ TCP/HTTP handler                                               │
│  ─ Interpreter (SQL → 物理算子)                                    │
│  ─ Query pipeline (向量化执行)                                    │
│  ─ MergeTree 存储引擎                                              │
└──────────────────────────────────────────────────────────────────┘
             ▲
             │  Zookeeper (副本协调)  ──► 多副本 shard
```

**关键点：**

- **单机向量化** + **shard 横向扩展**：单机性能极强（向量化 + 代码生成），
  集群是"多个单机拼起来"，没有真正的协调节点。
- **MergeTree 存储引擎**：sort key + partition + primary index + skip index
  四件套，跳数能力极强。
- **物化视图 (MaterializedView) 是核心**：CH 不擅长多表 join，但擅长"先把
  结果物化好"——典型做法是 `AggregatingMergeTree` + `SummingMergeTree`。
- **近似聚合函数**：`uniqHLL12`、`uniqTheta`、`quantileExact` 等专有函数是
  CH 的看家本领，比标准 SQL 的 `COUNT(DISTINCT)` 快一个数量级。

```sql
-- ClickHouse 专用：HLL 近似去重（误差 <1%）
SELECT
  toDate(event_ts) AS dt,
  uniqHLL12(user_id)        AS uv_hll,
  uniqCombined(user_id)     AS uv_combined,
  count()                    AS pv
FROM events
GROUP BY dt;
```

---

## ch04 · Doris 架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (FE) — stateless, 3+ 副本                               │
│   ─ SQL parse / plan / optimize / 调度                            │
│   ─ 元数据 (Catalog) 写入 BDBJE                                   │
└──────────────┬───────────────────────────────────────────────────┘
               │  thrift
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Backend (BE) — 100+ 节点, shared-nothing                          │
│   ─ Tablet 存储 (segment + bitmap index + BloomFilter)            │
│   ─ Pipeline 执行引擎 (向量化)                                     │
│   ─ Compaction 后台合并                                           │
└──────────────────────────────────────────────────────────────────┘
```

**关键点：**

- **FE / BE 分离**：FE 只负责 SQL 规划与元数据，可线性扩展；BE 是存储+计算
  节点，tablet 是其上的最小单位（通常 5-10 GB）。
- **聚合模型 (AGGREGATE KEY)**：Doris 的杀手锏之一——表 schema 里直接写
  聚合函数（`SUM`, `MAX`, `REPLACE_IF_NOT_NULL`），写入即聚合，读路径
  不需要再 GROUP BY。
- **Colocation Join**：相同 bucket 列的两个表 BE 节点对齐，join 直接走
  本地内存，无需 shuffle。
- **冷热分层**：数据从 SSD 冷到 S3/HDFS 自动迁移，不需要 ETL 搬数。

```sql
-- Doris 的聚合表 + colocated join
CREATE TABLE dwd.user_order_1d (
  user_id      BIGINT,
  dt           DATE,
  order_cnt    BIGINT  AGGREGATE SUM,
  gmv          DECIMAL AGGREGATE SUM
) ENGINE=OLAP
  AGGREGATE KEY (user_id, dt)
  DISTRIBUTED BY HASH(user_id) BUCKETS 32
  PROPERTIES ("replication_num" = "3");
```

---

## ch05 · StarRocks 架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (FE)                                                    │
│   ─ Parser / Analyzer / Optimizer (CBO + rewrite)                │
│   ─ Planner (cost-based)                                          │
│   ─ Scheduler (多 FE HA)                                          │
└──────────────┬───────────────────────────────────────────────────┘
               │  brpc
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Backend (BE / CN)                                                │
│   ─ Pipeline execution (向量化 + 异步 + runtime filter)           │
│   ─ 存储: Primary Key / Duplicate Key / Aggregate Key / Unique   │
│   ─ 数据通过 CBO 决定 colocated / shuffle / broadcast join       │
└──────────────────────────────────────────────────────────────────┘
```

**关键点：**

- **CBO 是 StarRocks 的灵魂**：从 1.16 开始全面转向 cost-based，比 rule-based
  多收益 30-300%。
- **主键表 (PRIMARY KEY)**：用 delete-vector + partial update，upsert
  性能接近 HBase，但保留 SQL 能力。这是 StarRocks 在实时数仓里压制 Doris 的关键。
- **Global Runtime Filter**：trino 思路的"运行时反向过滤"，StarRocks
  在 2.0 后做到 global（跨 fragment），所以多表 join 加速明显。
- **物化视图的查询重写**：用户写 `SELECT * FROM orders`，CBO 自动改写
  成 `SELECT * FROM mv_orders_by_day`，无需 SQL 改写。

```sql
-- StarRocks 主键表（实时 upsert）
CREATE TABLE dwd.orders_rt (
  order_id  BIGINT,
  user_id   BIGINT,
  total     DECIMAL(18,2),
  status    VARCHAR,
  dt        DATE,
  PRIMARY KEY (order_id)
) DISTRIBUTED BY HASH(order_id) BUCKETS 32;
```

---

## ch06 · 选型对比

| 维度 | Trino | ClickHouse | Doris | StarRocks |
|---|---|---|---|---|
| **强项** | 联邦查询、湖上 adhoc | 单机列存、极致压缩 | 实时 + 离线一体、聚合模型 | 主键 upsert、CBO |
| **弱项** | 写入吞吐弱、运维重 | 多表 join 拉垮 | 主键更新性能一般 | 生态偏国内、社区比 Trino 小 |
| **典型延迟** | 秒级（adhoc） | 百毫秒级（聚合） | 秒级（adhoc）/ 毫秒级（报表） | 毫秒级（点查）/ 秒级（adhoc） |
| **存储格式** | 依赖外部（Hive/Iceberg） | 自研 MergeTree | 自研 segment | 自研 + 主键表 |
| **写入** | INSERT 慢 | 批量导入极快 | 微批 + stream load | 微批 + stream + routine load |
| **运维成本** | 高（要会调优 + 监控） | 中 | 低（中文社区） | 低 |
| **适合场景** | 跨源 ad-hoc、湖上分析 | 日志/事件/单宽表聚合 | 国内中台、报表 | 实时数仓、亚秒级看板 |

**决策树（简化）：**

```
                  你的查询主要是？
                       │
        ┌──────────────┼────────────────┐
        ▼              ▼                ▼
   跨源 / 湖上      日志 / 事件        业务事实表
        │              │                │
        ▼              ▼                ▼
      Trino         ClickHouse    ┌─────┴─────┐
                                    ▼           ▼
                              报表为主     实时 upsert 为主
                                    │           │
                                    ▼           ▼
                                  Doris      StarRocks
```

**反共识**：

- "Trino 慢"是误读——Trino 在 10TB+ Iceberg 上是行业最强，
  只是不擅长点查。
- "ClickHouse 不支持事务"——CH 2.0 之后的事务能保证单次 INSERT 的原子性，
  跨表事务不在它的设计目标里。

---

## ch07 · 性能基准与基准 SQL 模板

本仓库的 [`src/olap_demo.sql`](src/olap_demo.sql) 用 DuckDB 跑出 5 类典型
OLAP 查询模式，覆盖了 90% 的真实 BI 报表：

| 模式 | 真实业务含义 | OLAP 引擎实现要点 |
|---|---|---|
| **q1 高基数 GROUP-BY** | 每用户每日的 GMV | hash-agg / two-phase agg |
| **q2 Top-N** | 每类目 GMV Top-10 商品 | 物化 Top-K 算子 |
| **q3 Approx distinct** | 每日 UV | HLL / Theta / HyperLogLog++ |
| **q4 Window function** | 滚动 7 日 GMV | rows between / range between |
| **q5 Multi-way JOIN** | 订单×商品×用户 | runtime filter / colocated |

在 DuckDB (in-memory) 上，5 类查询对 `data/small` 数据集
（10k orders / 50k events）均在 50ms 内完成；生产规模（100 亿行）下
四款引擎的典型耗时：

| 模式 | Trino (Iceberg) | ClickHouse | Doris | StarRocks |
|---|---|---|---|---|
| q1 高基数 GROUP-BY | 3-10s | 1-3s | 2-5s | 1-3s |
| q2 Top-N | 1-5s | < 1s | < 1s | < 1s |
| q3 Approx distinct | 2-8s | 0.3-1s | 1-3s | 1-3s |
| q4 Window | 3-12s | 5-20s | 3-10s | 3-8s |
| q5 4-way JOIN | 5-30s | 10-60s | 3-10s | 2-8s |

> **基准不是一个数字**：生产耗时由数据分布、cluster 规模、统计信息新鲜度
> 共同决定。同一份 SQL 在不同集群上 10 倍差异完全正常。

`tests/test_olap.py` 里 `test_benchmark_all_queries_run_under_2s` 是一个
**smoke gate**——只要 SQL 没退化（例如偶然写成 cross join），单 query
应在 2s 内完成。

---

## ch08 · 真实案例与反模式

### 案例 1：电商实时大屏（StarRocks）

- 数据流：Kafka → Flink-CDC → StarRocks (PRIMARY KEY)
- 延迟：端到端 1-3s
- 表设计：dwd.orders (主键) + dws.user_order_1d (聚合) + ads.daily_kpi (宽表)
- 关键决策：用 PRIMARY KEY 而非 UNIQUE KEY，因为订单状态会变

### 案例 2：埋点日志分析（ClickHouse）

- 数据流：Kafka → Kafka Connect → ClickHouse
- 表设计：单宽表 `events_local` + 物化视图 `events_daily_agg`
- 关键决策：所有维度预 join 到宽表，OLAP 查询只 GROUP BY，不再 JOIN

### 案例 3：跨源数据分析（Trino）

- 数据源：MySQL（业务库） + Hive（数仓） + Kafka（埋点）
- 场景：分析师临时写 SQL，跨三源 join
- 关键决策：不建宽表、不 ETL，由 Trino connector 直读

### 反模式 1：用 OLAP 跑 OLTP

OLAP 是列存 + 向量化扫描，**单行点查 1000 行以内**时性能反而比 OLTP 慢
5-50 倍。用户查询"我的订单"必须走 MySQL / TiDB / StarRocks 主键表
的 point-get，**不要走 Doris/ClickHouse 的全表扫描**。

### 反模式 2：把 JOIN 留给 OLAP 引擎

"反正 OLAP 引擎有 CBO，让它自动 join 就行"——这是 ETL 设计偷懒的
信号。**没有统计信息，CBO 就是猜**。生产中：

1. 把 80% 的报表提前物化成宽表（dws / ads）；
2. 把剩下 20% 的 adhoc 查询交给 Trino/ClickHouse；
3. 不要让分析师写 8-way join 然后期待引擎"优化好"。

### 反模式 3：高 QPS 写入到 ClickHouse

ClickHouse 的写入是 batch + merge，**单行写入 QPS > 1000** 就会触发
Too Many Parts。建议：

- 攒批到 8192 行 / 1 秒再写
- 用 Kafka + Buffer 表中转
- 或者改用 Doris / StarRocks 的 stream load

---

测试文件：[`tests/test_olap.py`](tests/test_olap.py) 用 DuckDB 验证
5 类查询的语义正确性 + GMV 对账 + 性能 smoke gate。