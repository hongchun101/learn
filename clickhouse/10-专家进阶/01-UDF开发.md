# 第 10 章：专家进阶

## 10.1 UDF（用户自定义函数）

### 10.1.1 SQL UDF（简单）

```sql
-- 创建
CREATE FUNCTION custom_function AS (x, y) -> x + y;

-- 使用
SELECT custom_function(1, 2);  -- 3

-- 删除
DROP FUNCTION custom_function;
```

### 10.1.2 Lambda UDF

```sql
-- 数组处理
CREATE FUNCTION array_sum_2x AS (arr) ->
    arraySum(x -> x * 2, arr);

SELECT array_sum_2x([1, 2, 3]);  -- 12
```

### 10.1.3 外部 UDF（C++）

```cpp
// /var/lib/clickhouse/user_defined/my_udf.cpp

#include <clickhouse/user_defined/UDF.h>

using namespace clickhouse;

extern "C" {
    // 标量 UDF
    void my_upper(const Block &block, ColumnPtr col, size_t row) {
        auto str = col->GetDataAt(row);
        std::string result(str);
        std::transform(result.begin(), result.end(), result.begin(), ::toupper);
        // 返回值...
    }

    // 聚合 UDF
    void my_sum(const Block &block, MutableColumnPtr &result) {
        auto &state_column = static_cast<ColumnAggregateFunction &>(*block.GetColumn(0));
        // ...
    }
}
```

### 10.1.4 实战：IP 解析 UDF

```sql
-- 启动参数：--user_defined_executable_functions_config=/etc/clickhouse-server/user_defined_functions.xml

<!-- /etc/clickhouse-server/user_defined_functions.xml -->
<functions>
    <function>
        <type>executable</type>
        <name>ip_to_location</name>
        <return_type>String</return_type>
        <argument>
            <type>String</type>
        </argument>
        <format>TabSeparated</format>
        <command>python3 /opt/ip_lookup.py</command>
    </function>

    <function>
        <type>executable_pool</type>
        <name>parallel_hash</name>
        <return_type>UInt64</return_type>
        <argument>
            <type>String</type>
        </argument>
        <format>TabSeparated</format>
        <command>python3 /opt/hash.py</command>
        <max_command_execution_time>10</max_command_execution_time>
        <pool_size>16</pool_size>
    </function>
</functions>
```

```python
# /opt/ip_lookup.py
import sys
import json
import requests

# 启动时加载（避免每次调用都加载）
IP_DB = {}  # 实际项目用 MaxMind GeoLite2

def lookup(ip):
    # 实际项目调用 IP 库
    return "Beijing" if ip.startswith("202.") else "Unknown"

# 主循环
for line in sys.stdin:
    ip = line.strip()
    print(lookup(ip))
    sys.stdout.flush()
```

```sql
-- 使用
SELECT
    user_id,
    ip_to_location(ip) AS location
FROM events;
```

## 10.2 高级聚合

### 10.2.1 Quantile 估算

```sql
-- 不同精度对比
SELECT
    -- 内存友好
    quantile(0.95)(latency) AS p95_estimate,
    -- 精确
    quantileExact(0.95)(latency) AS p95_exact,
    -- 平衡
    quantileTDigest(0.95)(latency) AS p95_tdigest,
    -- 高精度
    quantileBFloat16(0.95)(latency) AS p95_bf16
FROM events;

-- 内存对比
-- quantile:  几百字节（采样）
-- quantileExact: 几十KB
-- quantileTDigest: 1-10KB
-- quantileBFloat16: 100 字节
```

### 10.2.2 增量聚合（多级）

```sql
-- 第一级：实时统计（5 秒粒度）
CREATE TABLE events_5s_agg
(
    ts DateTime,
    event_type LowCardinality(String),
    cnt AggregateFunction(count, UInt64),
    uv AggregateFunction(uniq, UInt64)
) ENGINE = AggregatingMergeTree
ORDER BY (ts, event_type);

CREATE MATERIALIZED VIEW events_5s_mv TO events_5s_agg AS
SELECT
    toStartOfSecond(event_time) AS ts,
    event_type,
    countState() AS cnt,
    uniqState(user_id) AS uv
FROM events
GROUP BY ts, event_type;

-- 第二级：5 分钟聚合
CREATE TABLE events_5min_agg
(
    ts DateTime,
    event_type LowCardinality(String),
    cnt AggregateFunction(count, UInt64),
    uv AggregateFunction(uniq, UInt64)
) ENGINE = AggregatingMergeTree
ORDER BY (ts, event_type);

CREATE MATERIALIZED VIEW events_5min_mv TO events_5min_agg AS
SELECT
    toStartOfFiveMinute(ts) AS ts,
    event_type,
    countState(cnt) AS cnt,
    uniqState(uv) AS uv
FROM events_5s_agg
GROUP BY ts, event_type;

-- 查询
SELECT
    ts,
    event_type,
    countMerge(cnt) AS cnt,
    uniqMerge(uv) AS uv
FROM events_5min_agg
WHERE ts >= now() - INTERVAL 1 HOUR
GROUP BY ts, event_type
ORDER BY ts DESC;
```

## 10.3 Bitmap 高级应用

### 10.3.1 基数计算

```sql
-- 创建位图表
CREATE TABLE user_bitmap
(
    date Date,
    city String,
    users AggregateFunction(groupBitmap, UInt64)
) ENGINE = AggregatingMergeTree
ORDER BY (date, city);

-- 物化视图
CREATE MATERIALIZED VIEW user_bitmap_mv TO user_bitmap AS
SELECT
    toDate(event_time) AS date,
    city,
    groupBitmapState(user_id) AS users
FROM events
GROUP BY date, city;

-- 查询 UV
SELECT
    date,
    city,
    bitmapCardinality(bitmapMerge(users)) AS uv
FROM user_bitmap
WHERE date >= today() - 7
GROUP BY date, city;
```

### 10.3.2 留存分析

```sql
-- 今日活跃用户位图
SELECT
    bitmapCardinality(bitmapAnd(
        bitmapMerge(users_2024_01_01),
        bitmapMerge(users_2024_01_08)
    )) AS retained_users
FROM (
    SELECT users_2024_01_01, users_2024_01_08
    FROM (
        SELECT groupBitmapState(user_id) AS users_2024_01_01
        FROM events WHERE event_date = '2024-01-01'
    ) a,
    (
        SELECT groupBitmapState(user_id) AS users_2024_01_08
        FROM events WHERE event_date = '2024-01-08'
    ) b
);
```

## 10.4 向量检索（25.x 新特性）

```sql
-- 1. 创建向量表
CREATE TABLE documents
(
    id UInt64,
    title String,
    content String,
    -- 1024 维向量
    embedding Array(Float32)
) ENGINE = MergeTree
ORDER BY id;

-- 2. 插入
INSERT INTO documents VALUES
    (1, 'ClickHouse 教程', 'ClickHouse 是 OLAP 数据库...', arrayMap(i -> randNormal(0, 1) / 100, range(1024))),
    (2, 'MySQL 教程', 'MySQL 是 OLTP 数据库...', arrayMap(i -> randNormal(0, 1) / 100, range(1024)));

-- 3. 向量相似度搜索
SELECT
    id,
    title,
    -- 余弦相似度
    1 - cosineDistance(embedding, [0.1, 0.2, ...]) AS similarity
FROM documents
ORDER BY similarity DESC
LIMIT 10;

-- 4. 配合 ANN 索引（25.x+）
ALTER TABLE documents
ADD INDEX idx_embedding embedding TYPE vector_similarity('hnsw', 1024, 'cosineDistance');

ALTER TABLE documents MATERIALIZE INDEX idx_embedding;
```

## 10.5 时间序列优化

### 10.5.1 时序数据特征

```
- 时间戳是主索引
- 设备 ID 是高基数
- 数据追加为主，很少更新
- 保留期短（1-3 年）
```

### 10.5.2 最佳实践

```sql
-- 1. 物化日期列
CREATE TABLE sensor_data
(
    device_id UInt32,
    ts DateTime64(3),
    metric_date Date MATERIALIZED toDate(ts),
    value Float32,
    INDEX idx_value value TYPE minmax GRANULARITY 4
) ENGINE = MergeTree
PARTITION BY (metric_date, cityHash32(device_id) % 16)  -- 双重分区
ORDER BY (device_id, ts)
TTL metric_date + INTERVAL 1 YEAR;

-- 2. 降采样存储
CREATE TABLE sensor_data_1min
(
    device_id UInt32,
    minute DateTime,
    avg_value Float32,
    min_value Float32,
    max_value Float32
) ENGINE = SummingMergeTree
ORDER BY (device_id, minute);

CREATE MATERIALIZED VIEW sensor_1min_mv TO sensor_data_1min AS
SELECT
    device_id,
    toStartOfMinute(ts) AS minute,
    avg(value) AS avg_value,
    min(value) AS min_value,
    max(value) AS max_value
FROM sensor_data
GROUP BY device_id, minute;
```

## 10.6 JOIN 高级优化

### 10.6.1 分布式 JOIN 优化

```sql
-- 1. 开启 parallel_hash
SETTINGS
  join_algorithm = 'parallel_hash',
  max_threads = 16;

-- 2. 内存限制
SETTINGS
  max_bytes_in_join = 10000000000,  -- 10GB
  join_use_nulls = 1;

-- 3. GLOBAL JOIN（数据本地化）
SELECT *
FROM events_distributed e
GLOBAL JOIN users_distributed u ON e.user_id = u.user_id;
-- 比普通 JOIN 快 5-10 倍
```

### 10.6.2 大表 JOIN 优化

```sql
-- 方案 1：grace_hash（适合大表）
SETTINGS join_algorithm = 'grace_hash';

-- 方案 2：分阶段 JOIN
-- 步骤 1：先聚合
CREATE TEMPORARY TABLE events_agg AS
SELECT user_id, count() AS cnt FROM events GROUP BY user_id;

-- 步骤 2：小结果 JOIN
SELECT u.*, e.cnt
FROM users u
LEFT JOIN events_agg e ON u.user_id = e.user_id;

-- 方案 3：字典（极致性能）
-- 见 05 章
```

## 10.7 物化视图高级

### 10.7.1 链式物化视图

```sql
-- 多级聚合
-- Level 1: 原始 → 每秒
-- Level 2: 每秒 → 每分钟
-- Level 3: 每分钟 → 每小时
-- Level 4: 每小时 → 每天

CREATE MATERIALIZED VIEW events_1s_mv
ENGINE = SummingMergeTree
ORDER BY (event_type, second)
AS SELECT
    toStartOfSecond(event_time) AS second,
    event_type,
    count() AS cnt
FROM events
GROUP BY second, event_type;

CREATE MATERIALIZED VIEW events_1min_mv
ENGINE = SummingMergeTree
ORDER BY (event_type, minute)
AS SELECT
    toStartOfMinute(second) AS minute,
    event_type,
    sum(cnt) AS cnt
FROM events_1s_mv
GROUP BY minute, event_type;
```

### 10.7.2 增量物化视图（Refreshable）

```sql
-- 24.x+ 特性
CREATE MATERIALIZED VIEW daily_revenue_mv
REFRESH EVERY 1 HOUR
AS SELECT
    toDate(order_time) AS date,
    sum(amount) AS revenue,
    count() AS order_count
FROM orders
WHERE order_time >= today() - 90
GROUP BY date;

-- 手动刷新
SYSTEM REFRESH VIEW daily_revenue_mv;

-- 查看状态
SELECT
    view,
    refresh_time,
    next_refresh_time,
    status,
    last_exception
FROM system.view_refreshes;
```

## 10.8 性能极限优化

### 10.8.1 终极索引设计

```sql
-- 复杂业务表的索引设计
-- 业务查询模式：
-- Q1: WHERE date = ? AND merchant_id = ? GROUP BY user_id
-- Q2: WHERE user_id = ? AND date BETWEEN ? AND ?
-- Q3: WHERE merchant_id = ? AND status = ? ORDER BY date DESC

-- 方案：Projection
CREATE TABLE orders
(
    order_id UInt64,
    order_date Date,
    order_time DateTime,
    user_id UInt64,
    merchant_id UInt32,
    status LowCardinality(String),
    amount Decimal(18, 2)
) ENGINE = MergeTree
ORDER BY (order_date, order_id)  -- 主排序：日期+订单号
PARTITION BY toYYYYMM(order_date);

-- 为 Q1 创建 Projection
ALTER TABLE orders
ADD PROJECTION proj_by_merchant
(
    SELECT order_id, order_date, order_time, user_id, merchant_id, status, amount
    ORDER BY (merchant_id, order_date)
);

-- 为 Q2 创建 Projection
ALTER TABLE orders
ADD PROJECTION proj_by_user
(
    SELECT *
    ORDER BY (user_id, order_date)
);

-- 为 Q3 创建 Projection
ALTER TABLE orders
ADD PROJECTION proj_by_status
(
    SELECT *
    ORDER BY (merchant_id, status, order_date DESC)
);

-- 物化
ALTER TABLE orders MATERIALIZE PROJECTION proj_by_merchant;
ALTER TABLE orders MATERIALIZE PROJECTION proj_by_user;
ALTER TABLE orders MATERIALIZE PROJECTION proj_by_status;
```

### 10.8.2 列裁剪与压缩

```sql
-- 极致压缩（节省 50% 空间）
CREATE TABLE events_compressed
(
    event_date Date,
    event_time DateTime CODEC(DoubleDelta, ZSTD(3)),
    user_id UInt64 CODEC(Delta, ZSTD(3)),
    event_type LowCardinality(String),
    amount Decimal(10, 2) CODEC(Gorilla, ZSTD(3))
) ENGINE = MergeTree
ORDER BY (event_type, user_id, event_time);

-- 验证压缩比
SELECT
    table,
    formatReadableSize(sum(bytes_on_disk)) AS size,
    formatReadableSize(sum(data_uncompressed_bytes)) AS raw,
    round(sum(data_uncompressed_bytes) / sum(bytes_on_disk), 2) AS ratio
FROM system.parts
WHERE database = currentDatabase() AND table = 'events_compressed' AND active
GROUP BY table;
```

## 10.9 总结

✅ **本章要点**：
- 掌握 UDF、Lambda 函数、外部可执行函数
- 理解 AggregatingMergeTree 多级聚合
- 学会 Bitmap、向量检索、时间序列优化
- 掌握 JOIN、Projection 终极优化手段

📌 **下一步**：进入 [`11-实战项目`](../11-实战项目/01-用户行为分析.md) 完成实战项目。
