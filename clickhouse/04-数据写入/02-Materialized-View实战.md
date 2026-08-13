# 04-数据写入 续：Materialized View 实战

## 4.11 物化视图核心原理

### 4.11.1 数据流向

```
源表（Kafka/普通表）
    ↓ INSERT
    ↓
物化视图（自动触发）
    ↓
目标表（MergeTree / AggregatingMergeTree）

查询时直接查目标表（已聚合/转换）
```

### 4.11.2 完整实战：实时业务指标

```sql
-- ========================================
-- 1. 原始数据表（Kafka 消费）
-- ========================================
CREATE TABLE events_raw
(
    event_id UInt64,
    event_time DateTime,
    user_id UInt64,
    event_type LowCardinality(String),
    amount Decimal(18, 2),
    merchant_id UInt32,
    properties Map(String, String)
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka1:9092',
    kafka_topic_list = 'business_events',
    kafka_group_name = 'etl_consumer',
    kafka_format = 'JSONEachRow';

-- ========================================
-- 2. 存储到 ODS
-- ========================================
CREATE TABLE ods.events
(
    event_id UInt64,
    event_time DateTime,
    event_time_ms DateTime64(3),
    event_date Date MATERIALIZED toDate(event_time),
    user_id UInt64,
    event_type LowCardinality(String),
    amount Decimal(18, 2),
    merchant_id UInt32,
    properties Map(String, String)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_type, user_id, event_time);

-- 物化视图 1：Kafka → ODS
CREATE MATERIALIZED VIEW events_ods_mv TO ods.events AS
SELECT
    event_id,
    event_time,
    toDateTime64(event_time, 3) AS event_time_ms,
    user_id,
    event_type,
    amount,
    merchant_id,
    properties
FROM events_raw;

-- ========================================
-- 3. 实时业务指标（按分钟）
-- ========================================
CREATE TABLE dws.events_1min
(
    minute DateTime,
    event_type LowCardinality(String),
    merchant_id UInt32,
    cnt UInt64,
    uv AggregateFunction(uniq, UInt64),
    total_amount AggregateFunction(sum, Decimal(18, 2))
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(minute)
ORDER BY (minute, event_type, merchant_id);

-- 物化视图 2：ODS → 1 分钟聚合
CREATE MATERIALIZED VIEW events_1min_mv TO dws.events_1min AS
SELECT
    toStartOfMinute(event_time) AS minute,
    event_type,
    merchant_id,
    count() AS cnt,
    uniqState(user_id) AS uv,
    sumState(amount) AS total_amount
FROM ods.events
GROUP BY minute, event_type, merchant_id;

-- ========================================
-- 4. 商家实时统计（按 5 分钟）
-- ========================================
CREATE TABLE dws.merchant_5min
(
    window_start DateTime,
    merchant_id UInt32,
    pv UInt64,
    uv AggregateFunction(uniq, UInt64),
    revenue AggregateFunction(sum, Decimal(18, 2)),
    order_count UInt64
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(window_start)
ORDER BY (window_start, merchant_id);

CREATE MATERIALIZED VIEW merchant_5min_mv TO dws.merchant_5min AS
SELECT
    toStartOfFiveMinute(event_time) AS window_start,
    merchant_id,
    countIf(event_type = 'page_view') AS pv,
    uniqStateIf(user_id, event_type = 'page_view') AS uv,
    sumStateIf(amount, event_type = 'pay_success') AS revenue,
    countIf(event_type = 'pay_success') AS order_count
FROM ods.events
GROUP BY window_start, merchant_id;

-- ========================================
-- 5. 用户行为路径
-- ========================================
CREATE TABLE dws.user_paths
(
    user_id UInt64,
    session_id String,
    path Array(LowCardinality(String)),
    duration_seconds UInt32,
    event_count UInt32
) ENGINE = MergeTree
ORDER BY (user_id, session_id);

CREATE MATERIALIZED VIEW user_paths_mv TO dws.user_paths AS
SELECT
    user_id,
    properties['session_id'] AS session_id,
    groupArray(event_type) AS path,
    dateDiff('second', min(event_time), max(event_time)) AS duration_seconds,
    count() AS event_count
FROM ods.events
WHERE properties['session_id'] != ''
GROUP BY user_id, session_id;
```

## 4.12 链式物化视图

```sql
-- Level 1：1 分钟
-- Level 2：5 分钟
-- Level 3：1 小时
-- Level 4：1 天

-- Level 1：1 分钟
CREATE MATERIALIZED VIEW events_level1_mv
ENGINE = SummingMergeTree
ORDER BY (event_type, minute)
AS SELECT
    toStartOfMinute(event_time) AS minute,
    event_type,
    count() AS cnt
FROM ods.events
GROUP BY minute, event_type;

-- Level 2：5 分钟（基于 Level 1）
CREATE MATERIALIZED VIEW events_level2_mv
ENGINE = SummingMergeTree
ORDER BY (event_type, window_start)
AS SELECT
    toStartOfFiveMinute(minute) AS window_start,
    event_type,
    sum(cnt) AS cnt
FROM dws.events_1min
GROUP BY window_start, event_type;

-- Level 3：1 小时（基于 Level 2）
CREATE MATERIALIZED VIEW events_level3_mv
ENGINE = SummingMergeTree
ORDER BY (event_type, hour)
AS SELECT
    toStartOfHour(window_start) AS hour,
    event_type,
    sum(cnt) AS cnt
FROM dws.events_5min
GROUP BY hour, event_type;
```

## 4.13 增量物化视图（Refreshable MV）

```sql
-- 24.x+ 新特性：定时刷新的物化视图
-- 适用：离线数仓场景，替代定时 INSERT

-- 每日用户统计
CREATE MATERIALIZED VIEW daily_user_stats_mv
REFRESH EVERY 1 DAY OFFSET 1 HOUR  -- 每天 1 点刷新
AS SELECT
    toDate(event_time) AS date,
    user_id,
    count() AS event_count,
    uniqExact(event_type) AS event_types
FROM ods.events
WHERE event_time >= today() - 30
GROUP BY date, user_id;

-- 手动刷新
SYSTEM REFRESH VIEW daily_user_stats_mv;

-- 查看刷新状态
SELECT
    view,
    refresh_time,
    next_refresh_time,
    status,
    last_refresh_result
FROM system.view_refreshes;
```

## 4.14 实战：实时排行榜

```sql
-- 1. 销量表
CREATE TABLE realtime_sales
(
    window_start DateTime,
    product_id UInt32,
    category LowCardinality(String),
    sales_count UInt64,
    sales_amount AggregateFunction(sum, Decimal(18, 2))
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(window_start)
ORDER BY (category, window_start, product_id);

CREATE MATERIALIZED VIEW sales_1min_mv TO realtime_sales AS
SELECT
    toStartOfMinute(event_time) AS window_start,
    toUInt32OrZero(properties['product_id']) AS product_id,
    properties['category'] AS category,
    countIf(event_type = 'pay_success') AS sales_count,
    sumStateIf(amount, event_type = 'pay_success') AS sales_amount
FROM ods.events
WHERE event_type = 'pay_success'
GROUP BY window_start, product_id, category;

-- 2. 查询实时 Top 10 商品
SELECT
    product_id,
    sum(sales_count) AS total_sales,
    sumMerge(sales_amount) AS total_amount
FROM realtime_sales
WHERE window_start >= now() - INTERVAL 1 HOUR
GROUP BY product_id
ORDER BY total_sales DESC
LIMIT 10;
```

## 4.15 实战：实时大屏

```sql
-- ========================================
-- 多级预聚合
-- ========================================

-- 1. 1 分钟数据
CREATE TABLE realtime_minute
(
    minute DateTime,
    event_type LowCardinality(String),
    cnt UInt64,
    uv AggregateFunction(uniq, UInt64)
) ENGINE = AggregatingMergeTree
ORDER BY (minute, event_type);

CREATE MATERIALIZED VIEW realtime_minute_mv TO realtime_minute AS
SELECT
    toStartOfMinute(event_time) AS minute,
    event_type,
    count() AS cnt,
    uniqState(user_id) AS uv
FROM ods.events
GROUP BY minute, event_type;

-- 2. 当日累计
CREATE TABLE realtime_daily
(
    event_type LowCardinality(String),
    cnt UInt64
) ENGINE = SummingMergeTree
ORDER BY event_type;

CREATE MATERIALIZED VIEW realtime_daily_mv TO realtime_daily AS
SELECT
    event_type,
    count() AS cnt
FROM ods.events
WHERE toDate(event_time) = today()
GROUP BY event_type;

-- ========================================
-- 大屏 SQL
-- ========================================

-- 1. 核心指标
SELECT
    sumIf(cnt, event_type = 'page_view') AS total_pv,
    sumIf(cnt, event_type = 'pay_success') AS total_orders,
    uniqMerge(uv) AS total_uv
FROM realtime_daily AS d
LEFT JOIN realtime_minute AS m USING (event_type)
WHERE m.minute >= now() - INTERVAL 1 HOUR;

-- 2. 趋势图
SELECT
    minute,
    sumIf(cnt, event_type = 'page_view') AS pv,
    sumIf(cnt, event_type = 'click') AS clicks,
    sumIf(cnt, event_type = 'pay_success') AS pays
FROM realtime_minute
WHERE minute >= now() - INTERVAL 2 HOUR
GROUP BY minute
ORDER BY minute;

-- 3. 实时排行
SELECT
    properties['product_id'] AS product_id,
    count() AS sales
FROM ods.events
WHERE event_type = 'pay_success'
  AND event_time >= now() - INTERVAL 5 MINUTE
GROUP BY product_id
ORDER BY sales DESC
LIMIT 10;
```

## 4.16 性能监控

```sql
-- 查看 MV 消费延迟
SELECT
    database,
    table,
    rows,
    bytes_on_disk,
    last_insert_time,
    -- 延迟（秒）
    dateDiff('second', last_insert_time, now()) AS delay_seconds
FROM system.parts
WHERE active
  AND database NOT IN ('system')
ORDER BY last_insert_time
LIMIT 20;

-- 找到未消费的 MV
SELECT
    database,
    table,
    engine
FROM system.tables
WHERE engine LIKE '%MaterializedView%'
  AND database NOT IN ('system');
```

## 4.17 总结

✅ **本章要点**：
- 掌握 Materialized View 链式聚合原理
- 学会构建多级实时指标体系
- 理解 Refreshable MV 离线数仓场景
- 掌握实时排行榜、实时大屏的实现
