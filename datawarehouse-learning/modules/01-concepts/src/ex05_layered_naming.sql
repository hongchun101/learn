-- Module 01 / ch05 — layered warehouse naming and contracts.
-- Run with: duckdb < modules/01-concepts/src/ex05_layered_naming.sql

-- ============================================================
-- (1) ODS — raw landing, schema-on-read, one table per source
-- ============================================================
CREATE SCHEMA IF NOT EXISTS ods;
CREATE OR REPLACE TABLE ods.orders AS
SELECT * FROM read_parquet('data/small/orders.parquet');

-- ============================================================
-- (2) DWD — cleaned, conformed, deduped, "one event per row"
-- ============================================================
CREATE OR REPLACE SCHEMA dwd;
CREATE OR REPLACE TABLE dwd.orders AS
SELECT
  order_id,
  user_id,
  CAST(total AS DECIMAL(18,2)) AS total,
  CASE
    WHEN status IN ('created','paid','shipped','completed','cancelled','refunded')
    THEN status
    ELSE 'unknown'
  END AS status,
  CAST(order_date AS DATE) AS dt
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY order_ts DESC) AS rn
  FROM ods.orders
  WHERE order_id IS NOT NULL
    AND user_id  IS NOT NULL
    AND total    IS NOT NULL
) WHERE rn = 1;

-- ============================================================
-- (3) DWS — per-subject-per-day summary
-- ============================================================
CREATE OR REPLACE SCHEMA dws;
CREATE OR REPLACE TABLE dws.user_order_1d AS
SELECT
  user_id,
  dt,
  COUNT(*) AS order_count,
  SUM(total) AS order_amount
FROM dwd.orders
GROUP BY user_id, dt;

-- ============================================================
-- (4) DWT — cumulative subject state
-- ============================================================
CREATE OR REPLACE SCHEMA dwt;
CREATE OR REPLACE TABLE dwt.user_topic AS
SELECT
  user_id,
  MIN(dt) AS first_order_dt,
  MAX(dt) AS last_order_dt,
  COUNT(DISTINCT dt) AS active_days,
  SUM(order_count) AS lifetime_orders,
  SUM(order_amount) AS lifetime_amount
FROM dws.user_order_1d
GROUP BY user_id;

-- ============================================================
-- (5) ADS — application-facing wide table
-- ============================================================
CREATE OR REPLACE SCHEMA ads;
CREATE OR REPLACE TABLE ads.user_summary AS
SELECT
  u.user_id,
  u.user_name,
  u.level,
  t.first_order_dt,
  t.last_order_dt,
  t.active_days,
  t.lifetime_orders,
  t.lifetime_amount
FROM read_parquet('data/small/users.parquet') u
LEFT JOIN dwt.user_topic t USING (user_id);

-- ============================================================
-- (6) Verify each layer's contract
-- ============================================================
-- DWD must be <= ODS in row count (some dropped due to dedup/null)
SELECT
  (SELECT COUNT(*) FROM ods.orders)  AS ods_n,
  (SELECT COUNT(*) FROM dwd.orders)  AS dwd_n;

-- DWS must aggregate to exactly the same total
SELECT
  (SELECT ROUND(SUM(total), 2)        FROM dwd.orders) AS dwd_sum,
  (SELECT ROUND(SUM(order_amount), 2) FROM dws.user_order_1d) AS dws_sum;

-- DWT must equal the lifetime in DWS
SELECT
  (SELECT ROUND(SUM(lifetime_amount), 2) FROM dwt.user_topic) AS dwt_sum,
  (SELECT ROUND(SUM(order_amount), 2)    FROM dws.user_order_1d) AS dws_sum;

-- ADS has at most one row per user
SELECT user_id, COUNT(*) AS c
FROM ads.user_summary
GROUP BY user_id
HAVING c > 1;
-- expect 0 rows
