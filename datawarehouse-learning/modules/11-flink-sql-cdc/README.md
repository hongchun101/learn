# Module 11 · Flink SQL 与 Flink CDC

> 这一章介绍 Flink SQL（流处理的 SQL 抽象）和 CDC（Change Data
> Capture，变更数据捕获），以及它们在实时数仓中的角色。Flink
> SQL 让分析师**用 SQL 表达流处理逻辑**，CDC 把数据库的 binlog
> 变成**流式数据源**——两者结合就是实时数仓的入口。

读完这一章你能：

- 解释 **动态表（dynamic table）和连续查询（continuous query）**
- 区分 **Flink SQL 的 append-only / retract / upsert 三种流**
- 写出 **CDC 模式**：mysql-cdc / postgres-cdc / kafka-cdc
- 描述 **Debezium** 的工作原理
- 用 **Hudi / Paimon / Iceberg** 作为 Flink 的流式 sink
- 解释 **状态后端、TTL、维表 join** 的常见模式
- 在 Flink + Kafka + Paimon 之间做端到端实时 ETL

## 章节

- [ch01 · Flink SQL 概念](#ch01--flink-sql-概念)
- [ch02 · 动态表与连续查询](#ch02--动态表与连续查询)
- [ch03 · CDC 原理与 Debezium](#ch03--cdc-原理与-debezium)
- [ch04 · Flink CDC Connector](#ch04--flink-cdc-connector)
- [ch05 · 维表 Join](#ch05--维表-join)
- [ch06 · 状态与 TTL](#ch06--状态与-ttl)
- [ch07 · 流式 Sink：Hudi / Paimon / Iceberg](#ch07--流式-sinkhudi--paimon--iceberg)
- [ch08 · 端到端实时 ETL](#ch08--端到端实时-etl)

## 快速开始

```bash
pytest modules/11-flink-sql-cdc/tests/ -v
```

---

## ch01 · Flink SQL 概念

```
   ┌────────────┐    ┌─────────────┐    ┌────────────┐
   │  source(s) │ →  │  Flink SQL  │ →  │  sink(s)   │
   └────────────┘    │   query     │    └────────────┘
                     └─────────────┘
                     ↑      ↓
                  state    checkpoint
```

Flink SQL 把**无界流**（unbounded stream）看作**不断增长的表**
（dynamic table）；**SQL 查询**就是对这个表的**连续查询**
（continuous query）——每当表里来一条新数据，查询就被重新评估
一次，输出增量结果。

```sql
-- Flink SQL 写法
CREATE TABLE source_kafka (
  user_id   STRING,
  event     STRING,
  ts        TIMESTAMP(3),
  WATERMARK FOR ts AS ts - INTERVAL '5' SECOND
) WITH (
  'connector' = 'kafka',
  'topic'     = 'user_events',
  'properties.bootstrap.servers' = 'kafka:9092',
  'format'    = 'json'
);

CREATE TABLE sink_paimon (
  user_id  STRING,
  pv_count BIGINT
) WITH ('connector' = 'paimon', 'path' = 's3://warehouse/dws/');

INSERT INTO sink_paimon
SELECT user_id, COUNT(*) FILTER (WHERE event='pv')
FROM source_kafka
GROUP BY user_id;
```

---

## ch02 · 动态表与连续查询

| 模式 | 输入 | 输出 | 例子 |
|---|---|---|---|
| **Append-only** | append | append | `SELECT * FROM source` |
| **Retract** | append | upsert/delete | `SELECT user, SUM(x) FROM source GROUP BY user` |
| **Upsert** | upsert | upsert | 维表 join 后的结果 |

**Append-only 流**最简单：每条进来加一条。**Retract 流** 用于
聚合——每次上游来一条，下游可能需要"撤回"前一个值再发新值
（因为聚合结果变了）。**Upsert 流** 用于有主键的输出。

```sql
-- 启动模式 (changelog mode)
SET 'table.exec.source.cdc-events-duplicate' = 'false';

-- 输出模式
-- 'changelog.mode' = 'I'  (insert only)
-- 'changelog.mode' = 'UA' (update after, retract 旧值)
-- 'changelog.mode' = 'AI' (append insert, 适合 append sink)
```

---

## ch03 · CDC 原理与 Debezium

CDC = Change Data Capture：捕获数据库的变更（INSERT/UPDATE/DELETE），
转成流式事件，下游订阅。

**三种实现**：

| 方法 | 原理 | 优缺点 |
|---|---|---|
| **基于 trigger** | 在源表上建 trigger，把变更写到影子表 | 影响源库性能；不推荐 |
| **基于时间戳** | 源表加 `update_time` 列，定期扫 `> last_ts` | 简单；但漏 deleted 行；有时钟漂移 |
| **基于 binlog / WAL** | 解析数据库的 binary log（WAL） | **生产推荐**；不漏；不影响源库 |

**Debezium** 是最流行的 CDC 引擎：

```
   MySQL/PG/Oracle
        │
        ▼
   binlog / WAL
        │
   Debezium Connect (Kafka Connect)
        │
        ▼
   Kafka topic (cdc.orders, cdc.users, ...)
        │
        ▼
   Flink SQL
```

每条 CDC 消息：

```json
{
  "before": { "id": 1, "name": "alice", "level": "gold" },
  "after":  { "id": 1, "name": "alice", "level": "platinum" },
  "op": "u",                  // c=create, u=update, d=delete, r=read
  "ts_ms": 1717200000000,
  "source": { "db": "shop", "table": "users" }
}
```

---

## ch04 · Flink CDC Connector

```sql
CREATE TABLE source_mysql_users (
  id        INT,
  name      STRING,
  level     STRING,
  PRIMARY KEY (id) NOT ENFORCED
) WITH (
  'connector'        = 'mysql-cdc',
  'hostname'         = 'mysql',
  'port'             = '3306',
  'username'         = 'debezium',
  'password'         = '****',
  'database-name'    = 'shop',
  'table-name'       = 'users',
  'debezium.snapshot.mode' = 'initial',       -- 全量 + 增量
  'scan.incremental.snapshot.enabled' = 'true' -- 并行 snapshot
);
```

支持的 source：

| Connector | DB | 协议 |
|---|---|---|
| `mysql-cdc` | MySQL | binlog |
| `postgres-cdc` | PostgreSQL | logical decoding |
| `mongodb-cdc` | MongoDB | oplog |
| `oracle-cdc` | Oracle | redo log |
| `sqlserver-cdc` | SQL Server | CDC tables |
| `kafka-cdc` | Kafka | Debezium 消息 |
| `pgsql-cdc` | PostgreSQL | debezium / polardb |

---

## ch05 · 维表 Join

实时流 join 维表是数仓的常见需求（"订单流" join "用户维表"拿
到用户 level）。Flink 提供两种 join：

### (1) 同步查（Lookup Join）

```sql
SELECT
  o.order_id, o.user_id, u.level, o.total
FROM source_orders AS o
JOIN dim_user FOR SYSTEM_TIME AS OF o.proc_time AS u
  ON o.user_id = u.user_id;
```

维表放在外部存储（HBase / MySQL / Postgres），Flink 每来一条
订单就查一次维表。**延迟低，但维表大或查得慢时是瓶颈**。

### (2) 异步查（Async I/O）

```sql
-- 异步 API；吞吐高，但实现复杂
```

### (3) 全量预加载维表（小维表）

```sql
CREATE TABLE dim_user_small (
  user_id INT,
  level   STRING
) WITH ('connector' = 'datagen', 'rows-per-second' = '1');
-- 一次性把维表注册成 source，然后 broadcast
```

---

## ch06 · 状态与 TTL

Flink 的状态后端是 RocksDB 或内存。每条算子的 state 都有
`state.ttl`，过期会被清理。

```sql
-- 全局 TTL
SET 'table.exec.state.ttl' = '7 d';

-- 算子级 TTL（更细）
CREATE TABLE sink (
  user_id STRING,
  cnt     BIGINT
) WITH (
  'connector' = 'paimon',
  'sink.materialized-table.cache.ttl' = '1 h'
);
```

**典型 pattern**：

- **去重**：用 `ROW_NUMBER() OVER (PARTITION BY key ORDER BY ts)` + state TTL
- **最近 N 次访问**：用 `LISTAGG` + 截断
- **Top-N**：用 `RANK() <= N` + 状态
- **Pattern 匹配**：用 `MATCH_RECOGNIZE`（Flink 独有）

---

## ch07 · 流式 Sink：Hudi / Paimon / Iceberg

实时流的"目的地"是**数据湖表**。三种主流选项：

| Sink | 优势 | 劣势 | 何时用 |
|---|---|---|---|
| **Hudi** | 强 UPSERT；与 Spark 集成好 | 复杂 | 大数据量 CDC 入湖 |
| **Paimon** | 阿里出品；Flink-first | 较新 | Flink 实时入湖首选 |
| **Iceberg** | 标准化、Trino/Spark 通用 | UPSERT 稍弱 | 湖仓一体，跨引擎查询 |

```sql
-- Paimon sink (Flink)
CREATE TABLE dws.user_order_1d_paimon (
  user_id      STRING,
  dt           DATE,
  order_count  BIGINT,
  order_amount DECIMAL(18,2),
  PRIMARY KEY (user_id, dt) NOT ENFORCED
) WITH (
  'connector' = 'paimon',
  'path'      = 's3://warehouse/dws.db/user_order_1d',
  'sink.parallelism' = '4',
  'sink.bucket' = '8'
);
```

---

## ch08 · 端到端实时 ETL

```
MySQL ──binlog──> Kafka (cdc.orders)
                       │
                       ▼
            Flink SQL (清洗 + 维表 join)
                       │
                       ▼
              Paimon / Hudi / Iceberg  (dwd_orders)
                       │
                       ▼
            Flink SQL (聚合 1 分钟窗口)
                       │
                       ▼
              Paimon table  (dws_orders_1min)
                       │
                       ▼
            Trino / Spark / Doris  (query layer)
```

**关键设计**：

1. **维表 join 用 lookup join**（同步查 HBase / PG）
2. **去重用 PRIMARY KEY + 状态 TTL**（7 天够覆盖晚到数据）
3. **窗口用 TUMBLE/HOP/SESSION**，不直接用 GROUP BY（无界数据 GROUP BY 会爆状态）
4. **sink 用流式表（Paimon / Hudi）**，**不是 Kafka**（Kafka 不能查）
5. **下游用 Trino 查湖**（统一查询层）

---

## 章末练习

1. 在 `src/cdc_demo.sql` 里跑通 CDC 全量+增量模拟
2. 加测试：插入 UPDATE，确认 `cdc_out.user_current` 反映最新值
3. 加测试：late data 不影响 current state
4. 加测试：DELETE 之后 user 消失
5. 加测试：cdc audit log 完整

## 文件

```
11-flink-sql-cdc/
├── README.md
├── src/
│   └── cdc_demo.sql
└── tests/
    └── test_cdc.py
```
