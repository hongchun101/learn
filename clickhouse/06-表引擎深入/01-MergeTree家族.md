# 第 6 章：表引擎深入

## 6.1 表引擎全景

```
ClickHouse 表引擎
├── MergeTree 家族（生产环境主力）
│   ├── MergeTree（基础）
│   ├── ReplacingMergeTree（去重）
│   ├── SummingMergeTree（聚合求和）
│   ├── AggregatingMergeTree（聚合任意）
│   ├── CollapsingMergeTree（折叠）
│   ├── VersionedCollapsingMergeTree（版本折叠）
│   └── GraphiteMergeTree（监控指标）
├── Log 家族（小表）
│   ├── TinyLog
│   ├── StripeLog
│   └── Log
├── 集成引擎
│   ├── Kafka
│   ├── MySQL
│   ├── PostgreSQL
│   ├── ODBC
│   ├── JDBC
│   ├── HDFS
│   ├── S3
│   └── URL
├── 特殊用途
│   ├── Distributed（分布式）
│   ├── Dictionary（字典）
│   ├── Merge（多表合并）
│   ├── MaterializedView
│   ├── Buffer（内存缓冲）
│   ├── File（文件）
│   ├── Null（黑洞）
│   └── Set / Join / ExternalDistributed
└── 虚拟列与函数
    ├── Merge（函数）
    └── remote
```

## 6.2 MergeTree 基础

### 6.2.1 建表语法

```sql
CREATE TABLE [IF NOT EXISTS] [db.]table_name
(
    name1 [type1] [DEFAULT|MATERIALIZED|ALIAS expr1] [COMMENT 'comment'],
    name2 [type2] [...]
    INDEX index_name1 expr1 TYPE type1(...) GRANULARITY value,
    ...
)
ENGINE = MergeTree()
[PARTITION BY expr]
[ORDER BY expr]
[PRIMARY KEY expr]
[SAMPLE BY expr]
[TTL expr]
[SETTINGS name=value, ...]
```

### 6.2.2 关键 SETTINGS

```sql
-- 索引粒度
index_granularity = 8192

-- 自适应粒度
enable_mixed_granularity_parts = 1

-- 压缩算法
compress_lz4 = 1   -- LZ4（默认）
compress_zstd = 1  -- ZSTD（更高压缩比）

-- 存储格式
min_bytes_for_wide_part = 0   -- 强制宽格式
min_rows_for_wide_part = 0

-- Merge 策略
merge_max_block_size = 8192

-- 写入相关
max_partitions_in_total = 100

-- 列式存储
ratio_of_defaults_for_sparse_serialization = 0.95
```

## 6.3 ReplacingMergeTree（去重）

### 6.3.1 原理

```
场景：CDC 同步可能产生重复数据

MergeTree 不去重 → 数据重复
ReplacingMergeTree → merge 时按 ORDER BY 保留最新版本
```

### 6.3.2 语法

```sql
CREATE TABLE events_dedup
(
    event_id UInt64,
    event_time DateTime,
    user_id UInt64,
    event_type String,
    amount Decimal(10, 2),
    -- 版本列：值大的覆盖值小的
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMMDD(event_time)
ORDER BY (event_id, event_time)
PRIMARY KEY event_id;

-- 插入重复数据
INSERT INTO events_dedup VALUES
    (1, '2024-01-01 10:00:00', 1001, 'view', 0.00, 1),
    (1, '2024-01-01 10:00:00', 1001, 'view', 0.00, 2),  -- 同 event_id，version 更新
    (2, '2024-01-01 10:01:00', 1002, 'click', 0.00, 1);

-- 触发合并
OPTIMIZE TABLE events_dedup FINAL;

-- 查询：去重后只剩 2 行
SELECT * FROM events_dedup;
```

### 6.3.3 实战：CDC 同步去重

```sql
-- MySQL binlog → Kafka → ClickHouse
-- 同一条 UPDATE 产生多条 binlog，需要去重

CREATE TABLE mysql_orders_sync
(
    -- 业务主键
    order_id UInt64,
    -- 同步元数据
    _version UInt64,     -- binlog 位点
    _deleted UInt8,      -- 是否删除
    -- 业务字段
    user_id UInt64,
    amount Decimal(10, 2),
    status String,
    -- 时间
    update_time DateTime
) ENGINE = ReplacingMergeTree(_version)
PARTITION BY toYYYYMMDD(update_time)
ORDER BY (order_id);

-- 写入
INSERT INTO mysql_orders_sync VALUES
    (1, 1, 0, 1001, 99.50, 'paid', '2024-01-01 10:00:00'),
    (1, 2, 0, 1001, 99.50, 'shipped', '2024-01-01 11:00:00'),  -- 覆盖上一条
    (2, 1, 0, 1002, 50.00, 'paid', '2024-01-01 12:00:00');

-- 合并后
SELECT * FROM mysql_orders_sync FINAL ORDER BY order_id;
-- order_id=1, status='shipped'（最新版本）
-- order_id=2, status='paid'
```

## 6.4 SummingMergeTree（聚合求和）

### 6.4.1 原理

```
场景：明细数据累加
MergeTree → 100 万行明细
SummingMergeTree → 自动合并求和，剩 1000 行
```

### 6.4.2 实战：实时 PV/UV

```sql
CREATE TABLE page_views_agg
(
    date Date,
    page String,
    user_id UInt64,
    -- 数值列：自动求和
    view_count UInt64,
    duration UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(date)
ORDER BY (date, page, user_id);

-- 插入
INSERT INTO page_views_agg VALUES
    ('2024-01-01', '/home', 1001, 1, 30),
    ('2024-01-01', '/home', 1001, 1, 60),  -- 同 (date, page, user_id) → 合并
    ('2024-01-01', '/home', 1002, 1, 45),
    ('2024-01-01', '/about', 1001, 1, 20);

-- 合并后查询
SELECT
    date,
    page,
    count() AS uv,
    sum(view_count) AS pv,
    sum(duration) AS total_duration
FROM page_views_agg FINAL
GROUP BY date, page;
```

## 6.5 AggregatingMergeTree（任意聚合）

### 6.5.1 实战：实时指标

```sql
-- 创建聚合表
CREATE TABLE user_stats_agg
(
    date Date,
    event_type LowCardinality(String),
    -- 聚合状态
    cnt AggregateFunction(count, UInt64),
    uv AggregateFunction(uniq, UInt64),
    amount_sum AggregateFunction(sum, Decimal(10, 2))
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(date)
ORDER BY (date, event_type);

-- 物化视图
CREATE MATERIALIZED VIEW user_stats_mv TO user_stats_agg AS
SELECT
    toDate(event_time) AS date,
    event_type,
    countState() AS cnt,
    uniqState(user_id) AS uv,
    sumState(amount) AS amount_sum
FROM events
GROUP BY date, event_type;

-- 查询
SELECT
    date,
    event_type,
    countMerge(cnt) AS cnt,
    uniqMerge(uv) AS uv,
    sumMerge(amount_sum) AS amount
FROM user_stats_agg
WHERE date >= today() - 7
GROUP BY date, event_type
ORDER BY date, event_type;
```

## 6.6 CollapsingMergeTree（折叠删除）

### 6.6.1 原理

```
场景：频繁更新的状态字段
用 sign 列标记（1=有效，-1=删除）

INSERT (1, 'state_a', sign=1)  -- 添加
INSERT (1, 'state_a', sign=-1) -- 删除
INSERT (1, 'state_b', sign=1)  -- 添加新状态
```

### 6.6.2 实战

```sql
CREATE TABLE user_status
(
    user_id UInt64,
    status String,
    sign Int8  -- 1 or -1
)
ENGINE = CollapsingMergeTree(sign)
ORDER BY user_id;

-- 用户状态变更
INSERT INTO user_status VALUES (1, 'active', 1);
INSERT INTO user_status VALUES (1, 'banned', -1), (1, 'banned', 1);
INSERT INTO user_status VALUES (2, 'active', 1);

-- 查询当前有效状态
SELECT
    user_id,
    -- 状态折叠：相同 user_id 的 sign 求和
    argMax(status, sign) AS status  -- 取 sign 最大的 status
FROM user_status FINAL
WHERE sign = 1
GROUP BY user_id;
```

## 6.7 VersionedCollapsingMergeTree（版本折叠）

### 6.7.1 区别

```sql
-- CollapsingMergeTree 问题：多线程乱序写入时 sign 抵消错误

-- VersionedCollapsing：用 version 列避免乱序问题
CREATE TABLE user_status_v2
(
    user_id UInt64,
    status String,
    sign Int8,
    version UInt64  -- 版本号
)
ENGINE = VersionedCollapsingMergeTree(sign, version)
ORDER BY user_id;
```

## 6.8 Log 家族

### 6.8.1 对比

| 引擎 | 写 | 读 | 用途 |
|------|----|----|------|
| TinyLog | 快 | 慢 | 临时表 |
| Log | 中 | 中 | 简单场景 |
| StripeLog | 快 | 快 | 一次性写、多次读 |

### 6.8.2 实战：临时表

```sql
-- 临时表
CREATE TEMPORARY TABLE temp_result
(
    id UInt64,
    value String
) ENGINE = Log;

-- 数据处理
INSERT INTO temp_result SELECT id, value FROM source_table;
-- 会话结束自动删除
```

## 6.9 集成引擎

### 6.9.1 MySQL 引擎

```sql
-- 1. 直接查询
CREATE TABLE mysql_users
(
    id UInt32,
    name String,
    created_at DateTime
) ENGINE = MySQL('mysql_host:3306', 'db', 'users', 'user', 'password');

SELECT * FROM mysql_users;

-- 2. 物化 MySQL（实时同步）
CREATE DATABASE mysql_replica
ENGINE = MaterializedMySQL('mysql_host:3306', 'source_db', 'user', 'password');
-- 自动同步所有表
```

### 6.9.2 PostgreSQL 引擎

```sql
CREATE TABLE pg_table
(
    id UInt32,
    data String
) ENGINE = PostgreSQL('pg_host:5432', 'db', 'table', 'user', 'password', 'public');
```

### 6.9.3 S3 引擎

```sql
-- 直接读 S3 文件
CREATE TABLE s3_data
(
    id UInt32,
    name String,
    amount Float64
) ENGINE = S3(
    'https://s3.amazonaws.com/bucket/data*.csv',
    'AWS_ACCESS_KEY',
    'AWS_SECRET_KEY',
    'CSV'
);

-- 查询
SELECT * FROM s3_data WHERE id > 1000 LIMIT 100;

-- 写入到 S3
INSERT INTO s3_data SELECT * FROM local_table;
```

### 6.9.4 HDFS 引擎

```sql
CREATE TABLE hdfs_table
(
    id UInt32,
    data String
) ENGINE = HDFS('hdfs://namenode:8020/data/*.parquet', 'Parquet');
```

## 6.10 特殊引擎

### 6.10.1 Distributed

```sql
-- 创建分布式表（写入/查询路由）
CREATE TABLE events_distributed AS events
ENGINE = Distributed(
    'cluster_name',  -- 集群名
    'db',            -- 数据库
    'events',        -- 本地表
    rand()           -- 分片键（rand/hash/user_id）
);

-- 写入
INSERT INTO events_distributed SELECT * FROM events_local;

-- 查询（自动从所有分片拉取）
SELECT count() FROM events_distributed;
```

### 6.10.2 Buffer（内存缓冲）

```sql
-- 场景：高并发小写入
-- Buffer 自动将小批量合并刷到目标表

CREATE TABLE events_buffer AS events
ENGINE = Buffer(
    'db', 'events',  -- 目标表
    16,              -- 16 个 buffer 层
    10,              -- 10 秒
    10000000,        -- 1000 万行
    100000000,       -- 1 亿字节
    0,               -- flush 时不压缩
    10000000         -- 最大 1000 万行
);

-- 写入（极快）
INSERT INTO events_buffer VALUES ...;

-- 强制刷盘
OPTIMIZE TABLE events_buffer;
```

### 6.10.3 Merge（多表合并）

```sql
-- 场景：按月分表，查询时合并

CREATE TABLE events_202401 (id UInt32, event_time DateTime, ...) ENGINE = MergeTree ORDER BY id PARTITION BY toYYYYMM(event_time);
CREATE TABLE events_202402 (...) ENGINE = MergeTree ORDER BY id;
CREATE TABLE events_202403 (...) ENGINE = MergeTree ORDER BY id;

-- 创建合并视图
CREATE TABLE events_all AS events_202401
ENGINE = Merge('db', '^events_20240[1-3]$');

SELECT * FROM events_all WHERE event_time BETWEEN '2024-01-01' AND '2024-03-31';
```

### 6.10.4 Null（黑洞）

```sql
-- 测试写入性能（不存储）
CREATE TABLE test_perf (...) ENGINE = Null;

INSERT INTO test_perf SELECT * FROM source;
-- 测出纯写入开销
```

## 6.11 引擎选型决策树

```
需要表引擎？
│
├── 生产数据存储 ──→ MergeTree 系列
│   │
│   ├── 需要去重？ ──→ ReplacingMergeTree
│   ├── 求和聚合？ ──→ SummingMergeTree
│   ├── 复杂聚合？ ──→ AggregatingMergeTree
│   ├── 状态变更？ ──→ CollapsingMergeTree
│   └── 普通场景 ──→ MergeTree
│
├── 数据源接入
│   ├── MySQL ──→ MaterializedMySQL / MySQL
│   ├── Kafka ──→ Kafka + Materialized View
│   ├── S3 ──→ S3
│   └── HDFS ──→ HDFS
│
├── 临时/中间结果
│   ├── 临时 ──→ Log / Memory
│   └── 缓冲 ──→ Buffer
│
├── 分布式
│   └── 跨分片 ──→ Distributed
│
└── 测试
    └── 性能测试 ──→ Null
```

## 6.12 总结

✅ **本章要点**：
- 掌握 MergeTree 家族的 7 大引擎及适用场景
- 学会用 -State/-Merge 函数实现任意聚合
- 理解 ReplacingMergeTree、CollapsingMergeTree 去重与折叠原理
- 掌握集成引擎（MySQL、Kafka、S3、HDFS）的使用

📌 **下一步**：进入 [`07-高性能架构`](../07-高性能架构/01-集群设计.md) 学习分布式架构。
