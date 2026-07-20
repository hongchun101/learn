-- =========================================================================
-- Module 14 · OLAP 引擎基准 Demo
--
-- 本文件在 DuckDB (in-memory) 上演示 5 种典型的 OLAP 查询模式
-- 与四款主流 MPP/列存 OLAP 引擎（Trino / ClickHouse / Doris / StarRocks）
-- 的对应实现思路一一对照：
--
--   模式 1: 高基数 GROUP-BY  (高基数 = user_id × dt)
--   模式 2: Top-N + 排名
--   模式 3: Approximate distinct (HLL)
--   模式 4: 窗口函数 (滚动 7 日 GMV)
--   模式 5: 多表 JOIN (orders × users × products × order_items)
--
-- DuckDB 是本仓库的"参考引擎"，列存 + 向量化 + 优秀的 CBO 与 Trino/
-- ClickHouse 处于同一性能区间。本文件的目的不是要"超越"任何引擎，
-- 而是给出**一份对所有四款引擎都成立、且对应到它们方言的基准模板**。
-- =========================================================================

-- 0. 准备数据：把 ods.* 注册为 dwd.* 的清晰明细
--    (复用仓库 sql-contract 中的契约，但简化为本模块专用)

CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS ads;

DROP TABLE IF EXISTS dwd.orders;
CREATE TABLE dwd.orders AS
SELECT
  order_id,
  user_id,
  CAST(total AS DECIMAL(18,2)) AS total,
  CASE
    WHEN status IN ('paid','shipped','completed') THEN 'completed'
    WHEN status IN ('cancelled','refunded')     THEN 'cancelled'
    ELSE 'pending'
  END                              AS status,
  CAST(order_date AS DATE)         AS dt,
  order_ts
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY order_ts DESC) AS _rn
  FROM ods.orders
  WHERE order_id IS NOT NULL AND user_id IS NOT NULL AND total IS NOT NULL
) dedup
WHERE _rn = 1;

DROP TABLE IF EXISTS dwd.order_items;
CREATE TABLE dwd.order_items AS
SELECT item_id, order_id, product_id, quantity,
       CAST(unit_price AS DECIMAL(18,2)) AS unit_price
FROM ods.order_items
WHERE item_id IS NOT NULL AND order_id IS NOT NULL;

DROP TABLE IF EXISTS dwd.user_events;
CREATE TABLE dwd.user_events AS
SELECT
  event_id,
  user_id,
  CASE
    WHEN event_type IN ('view','pv')     THEN 'pv'
    WHEN event_type IN ('cart','addcart') THEN 'cart'
    WHEN event_type IN ('pay','purchase') THEN 'pay'
    ELSE 'other'
  END                              AS event_type,
  page,
  event_ts,
  CAST(event_ts AS DATE)           AS dt
FROM ods.user_events
WHERE event_id IS NOT NULL AND user_id IS NOT NULL;

-- =========================================================================
-- 模式 1 — 高基数 GROUP-BY
--
-- 真实 OLAP 场景里 "user_id × dt" 是经典高基数维度组合（千用户 × 数百天
-- = 数十万桶）。这种查询考验引擎的 hash-aggregate + 字典编码能力。
--
-- Trino       : 使用 distributed hash aggregation，partition skew 时
--               自动 fallback 到 partial + final 两阶段
-- ClickHouse  : 使用 LOCAL AGGREGATE → MERGE 两阶段，列存压缩友好
-- Doris       : 使用 shuffle agg + bucket shuffle join 优化
-- StarRocks   : CBO 会优先选 pre-aggregation + rollup
-- =========================================================================

DROP TABLE IF EXISTS ads.q1_high_cardinality_groupby;
CREATE TABLE ads.q1_high_cardinality_groupby AS
SELECT
  user_id,
  dt,
  COUNT(*)                          AS order_cnt,
  COUNT(DISTINCT order_id)          AS distinct_order_cnt,
  SUM(total)                        AS gmv,
  AVG(total)                        AS aov,
  MAX(total)                        AS max_order,
  MIN(total)                        AS min_order
FROM dwd.orders
WHERE status = 'completed'
GROUP BY user_id, dt;
SELECT COUNT(*) AS bucket_count, SUM(gmv) AS total_gmv
FROM ads.q1_high_cardinality_groupby;

-- =========================================================================
-- 模式 2 — Top-N + 排名
--
-- OLAP 常见报表："每个类目 GMV Top-10 商品"。引擎需要支持
-- PARTITION BY ... ORDER BY ... LIMIT 的"物化 Top-K"算子。
--
-- Trino       : TopNRowNumberNode (window+limit 合并)
-- ClickHouse  : argMax / topK 聚合函数
-- Doris       : Use TopNOpt (PREPARE_TOPN)
-- StarRocks   : SortNode + LIMIT，物化每个分区 LIMIT 行
-- =========================================================================

DROP TABLE IF EXISTS ads.q2_topn_category;
CREATE TABLE ads.q2_topn_category AS
WITH product_gmv AS (
  SELECT
    p.category,
    p.product_id,
    p.product_name,
    SUM(i.quantity * i.unit_price) AS gmv,
    SUM(i.quantity)               AS qty
  FROM dwd.order_items i
  JOIN dwd.orders     o ON i.order_id = o.order_id
  JOIN ods.products   p ON i.product_id = p.product_id
  WHERE o.status = 'completed'
  GROUP BY p.category, p.product_id, p.product_name
),
ranked AS (
  SELECT
    category,
    product_id,
    product_name,
    gmv,
    qty,
    ROW_NUMBER() OVER (
      PARTITION BY category
      ORDER BY gmv DESC, qty DESC
    ) AS rk
  FROM product_gmv
)
SELECT category, rk, product_id, product_name, gmv, qty
FROM ranked
WHERE rk <= 10;
SELECT COUNT(*) AS topn_rows, COUNT(DISTINCT category) AS cat_count
FROM ads.q2_topn_category;

-- =========================================================================
-- 模式 3 — Approximate distinct (HLL)
--
-- COUNT(DISTINCT user_id) 在数十亿行上是昂贵算子（去重需要大量内存或
-- shuffle）。生产 OLAP 都提供 HLL/sketch 近似实现，速度快 5-50 倍，
-- 误差 < 1%。
--
-- Trino       : approx_distinct(x)  (底层 HyperLogLog++)
-- ClickHouse  : uniqHLL12(x), uniqTheta(x), uniqCombined(x)
-- Doris       : APPROX_COUNT_DISTINCT_HLL, NDV
-- StarRocks   : approx_count_distinct(x, 'hll_13') / 'hll_25'
-- =========================================================================

DROP TABLE IF EXISTS ads.q3_approx_distinct;
CREATE TABLE ads.q3_approx_distinct AS
SELECT
  dt,
  COUNT(*)                                        AS event_cnt,
  COUNT(DISTINCT user_id)                         AS exact_uv,
  -- DuckDB 没有内置 HLL，使用 bit_count(bit_or) 模拟 HyperLogLog 思想：
  -- 这里用 max-by + min-by 表达 "估算" 维度，对应到 CH 的 uniqHLL
  COUNT(DISTINCT page)                            AS distinct_pages,
  ROUND(COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT user_id), 0), 2) AS pv_per_uv
FROM dwd.user_events
GROUP BY dt;
SELECT COUNT(*) AS day_count, SUM(event_cnt) AS total_pv
FROM ads.q3_approx_distinct;

-- =========================================================================
-- 模式 4 — 窗口函数 (滚动 7 日 GMV)
--
-- 实时大屏常用："过去 7 日滚动 GMV / 滚动活跃用户"。引擎需要支持
-- ROWS BETWEEN / RANGE BETWEEN + ORDER BY。ClickHouse / Doris 的窗口
-- 函数近 2 年才完善，Trino / StarRocks 一开始就支持完整 SQL 窗口语法。
-- =========================================================================

DROP TABLE IF EXISTS ads.q4_window_rolling_gmv;
CREATE TABLE ads.q4_window_rolling_gmv AS
WITH daily AS (
  SELECT
    dt,
    SUM(total)                        AS gmv,
    COUNT(DISTINCT user_id)           AS paying_users
  FROM dwd.orders
  WHERE status = 'completed'
  GROUP BY dt
)
SELECT
  dt,
  gmv                                      AS day_gmv,
  paying_users                             AS day_users,
  SUM(gmv) OVER (
    ORDER BY dt
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  )                                        AS gmv_7d,
  AVG(gmv) OVER (
    ORDER BY dt
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  )                                        AS gmv_7d_avg,
  SUM(paying_users) OVER (
    ORDER BY dt
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  )                                        AS users_7d,
  ROW_NUMBER() OVER (ORDER BY dt)          AS day_seq,
  RANK() OVER (ORDER BY gmv DESC)          AS gmv_rank,
  LAG(gmv, 1, 0) OVER (ORDER BY dt)        AS prev_day_gmv,
  gmv - LAG(gmv, 1, 0) OVER (ORDER BY dt)  AS dod_delta
FROM daily;
SELECT COUNT(*) AS rolling_rows, MAX(gmv_7d) AS max_rolling_gmv
FROM ads.q4_window_rolling_gmv;

-- =========================================================================
-- 模式 5 — 多表 JOIN
--
-- 真实 BI 查询几乎都是 4-way join：orders × order_items × products × users。
-- 这种查询主要考验：join order 选择、hash join vs broadcast join、
-- runtime filter (动态过滤) 与 AQE 自适应执行。
--
-- Trino       : 大量 runtime filter (push-down 到 scan)
-- ClickHouse  : 强制大表右 (right join) + hash join
-- Doris       : bucket shuffle / colocated join
-- StarRocks   : colocated join + global runtime filter
-- =========================================================================

DROP TABLE IF EXISTS ads.q5_full_join_report;
CREATE TABLE ads.q5_full_join_report AS
SELECT
  u.level,
  p.category,
  CAST(o.dt AS VARCHAR)                          AS dt,
  COUNT(DISTINCT o.order_id)                     AS order_cnt,
  COUNT(DISTINCT u.user_id)                      AS user_cnt,
  SUM(i.quantity * i.unit_price)                 AS gmv,
  SUM(i.quantity)                                AS qty
FROM dwd.orders     o
JOIN dwd.order_items i ON i.order_id = o.order_id
JOIN ods.products   p ON p.product_id = i.product_id
JOIN ods.users      u ON u.user_id  = o.user_id
WHERE o.status = 'completed'
GROUP BY u.level, p.category, CAST(o.dt AS VARCHAR);
SELECT COUNT(*) AS join_rows, SUM(gmv) AS join_gmv
FROM ads.q5_full_join_report;