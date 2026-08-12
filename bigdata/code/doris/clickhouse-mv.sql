-- ===================================================================
-- ClickHouse 引擎族与 MV、TTL、Projection 实战
--   覆盖:
--     1) MergeTree / ReplacingMergeTree / SummingMergeTree / AggregatingMergeTree
--     2) ORDER BY Tuple(本地排序)
--     3) PARTITION BY ttl 冷热分层
--     4) 物化视图(AggregatingMergeTree + MV 自动增量聚合)
--     5) Projection(为同一表建立另一种排序)
-- ===================================================================

-- 1) 主表
CREATE TABLE IF NOT EXISTS shop.dwd_event (
    event_time   DateTime64(3),
    user_id      Int64,
    event_type   LowCardinality(String),
    sku_id       Int64,
    amount       Decimal(18, 4),
    dt           Date
) ENGINE = MergeTree
PARTITION BY dt
ORDER BY (user_id, event_time, event_type)
TTL dt + INTERVAL 30 DAY DELETE,  -- 30 天自动清理
    amount > 1000 SETTINGS storage_policy = 'cold_to_ssd'
SETTINGS index_granularity = 8192;

-- 2) ReplacingMergeTree(去重)
CREATE TABLE IF NOT EXISTS shop.dwd_user (
    user_id      Int64,
    user_name    String,
    vip_level    LowCardinality(String),
    update_time  DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(update_time)
ORDER BY user_id;

-- 3) 自增物化视图(基于 AggregatingMergeTree + MV)
CREATE TABLE IF NOT EXISTS shop.dws_user_gmv
(
    user_id Int64,
    gmv     AggregateFunction(sum, Decimal(18, 4)),
    cnt     AggregateFunction(count, UInt64)
) ENGINE = AggregatingMergeTree
ORDER BY user_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS shop.mv_dws_user_gmv
TO shop.dws_user_gmv AS
SELECT
    user_id,
    sumState(amount) AS gmv,
    countState()     AS cnt
FROM shop.dwd_event
GROUP BY user_id;

-- 4) 查询物化视图
SELECT
    user_id,
    sumMerge(gmv) AS gmv_total,
    countMerge(cnt) AS cnt_total
FROM shop.dws_user_gmv
GROUP BY user_id
ORDER BY gmv_total DESC
LIMIT 100;

-- 5) Projection(同一表两种排序,按需查询)
ALTER TABLE shop.dwd_event
ADD PROJECTION proj_by_sku (
    SELECT sku_id, event_time, amount
    ORDER BY (sku_id, event_time)
);

ALTER TABLE shop.dwd_event
MATERIALIZE PROJECTION proj_by_sku;

-- 查询时若 order by / filter 与 Projection 匹配,自动命中 Projection
SELECT sku_id, sum(amount)
FROM shop.dwd_event
WHERE event_time BETWEEN '2026-08-12 00:00:00' AND '2026-08-12 23:59:59'
GROUP BY sku_id;
