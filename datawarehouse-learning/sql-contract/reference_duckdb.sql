-- sql-contract/reference_duckdb.sql
--
-- Reference implementation of the SQL contract against DuckDB.
-- Run with: pytest tests/test_contracts_duckdb.py
-- Or directly: duckdb -c ".read sql-contract/reference_duckdb.sql"
--
-- This file is the **specification**: it must run, end-to-end, on a
-- fresh in-memory DuckDB after loading the demo dataset. Other engines
-- (Hive / Spark / Trino / Flink) port these statements to their own
-- dialect; the invariants they must satisfy are in invariants.md.

-- ----------------- 0. demo data (assumed loaded by runner) -----------
-- ods.users, ods.products, ods.orders, ods.order_items, ods.user_events
-- are populated by the test harness.

-- ----------------- 1. DDL: schemas ---------------------------------
CREATE SCHEMA IF NOT EXISTS ods;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS dws;
CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS dim;
CREATE SCHEMA IF NOT EXISTS dwt;

-- ----------------- 2. DWD: clean and conform -----------------------

-- Drop and rebuild dwd.orders (test runs are idempotent)
DROP TABLE IF EXISTS dwd.orders;
CREATE TABLE dwd.orders AS
SELECT
  order_id,
  user_id,
  CAST(total AS DECIMAL(18,2)) AS total,
  CASE
    WHEN status IN ('created','paid','shipped','completed','cancelled','refunded')
    THEN status
    ELSE 'unknown'
  END                                AS status,
  CAST(order_date AS DATE)          AS dt,
  order_ts
FROM (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY order_id
      ORDER BY order_ts DESC
    ) AS _rn
  FROM ods.orders
  WHERE order_id IS NOT NULL
    AND user_id  IS NOT NULL
    AND total    IS NOT NULL
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
    WHEN event_type IN ('pv','cart','fav','pay') THEN event_type
    ELSE 'other'
  END                              AS event_type,
  page,
  event_ts,
  CAST(event_ts AS DATE)           AS dt
FROM ods.user_events
WHERE event_id IS NOT NULL AND user_id IS NOT NULL;

-- ----------------- 3. DIM: SCD-2 -----------------------------------

DROP TABLE IF EXISTS dim.user_scd2;
CREATE TABLE dim.user_scd2 AS
SELECT
  user_id,
  user_name,
  level,
  CAST(register_date AS DATE)     AS register_date,
  DATE '2024-01-01'               AS valid_from,
  DATE '9999-12-31'               AS valid_to,
  TRUE                            AS is_current
FROM ods.users;

-- ----------------- 4. DWS: per-user-per-day ------------------------

DROP TABLE IF EXISTS dws.user_order_1d;
CREATE TABLE dws.user_order_1d AS
SELECT
  user_id,
  dt,
  COUNT(*)                                  AS order_count,
  SUM(total)                                AS order_amount,
  COUNT(DISTINCT order_id)                  AS distinct_order_count,
  SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END) AS gmv
FROM dwd.orders
GROUP BY user_id, dt;

DROP TABLE IF EXISTS dws.product_sales_1d;
CREATE TABLE dws.product_sales_1d AS
SELECT
  i.product_id,
  o.dt,
  SUM(i.quantity)         AS qty_sum,
  SUM(i.quantity * i.unit_price) AS gmv
FROM dwd.order_items i
JOIN dwd.orders o ON i.order_id = o.order_id
GROUP BY i.product_id, o.dt;

-- ----------------- 5. DWT: cumulative subject state ----------------

DROP TABLE IF EXISTS dwt.user_topic;
CREATE TABLE dwt.user_topic AS
SELECT
  user_id,
  MIN(dt)                  AS first_order_dt,
  MAX(dt)                  AS last_order_dt,
  COUNT(DISTINCT dt)       AS active_days,
  SUM(order_count)         AS lifetime_orders,
  SUM(order_amount)        AS lifetime_amount
FROM dws.user_order_1d
GROUP BY user_id;

-- ----------------- 6. ADS: application-facing ----------------------

DROP TABLE IF EXISTS ads.gmv_daily;
CREATE TABLE ads.gmv_daily AS
SELECT
  dt,
  SUM(order_amount)        AS gmv,
  COUNT(DISTINCT user_id)  AS paying_users,
  SUM(order_count)         AS order_count
FROM dws.user_order_1d
GROUP BY dt
ORDER BY dt;

DROP TABLE IF EXISTS ads.user_rfm;
CREATE TABLE ads.user_rfm AS
WITH last_dt AS (
  SELECT MAX(dt) AS snapshot_dt FROM dws.user_order_1d
),
recency AS (
  SELECT
    u.user_id,
    (SELECT snapshot_dt FROM last_dt) - MAX(o.dt) AS recency_days
  FROM ods.users u
  LEFT JOIN dwd.orders o ON u.user_id = o.user_id
  GROUP BY u.user_id
),
freq AS (
  SELECT user_id, COUNT(DISTINCT order_id) AS frequency
  FROM dwd.orders
  GROUP BY user_id
),
mon AS (
  SELECT user_id, SUM(total) AS monetary FROM dwd.orders GROUP BY user_id
)
SELECT
  r.user_id,
  r.recency_days,
  COALESCE(f.frequency, 0) AS frequency,
  COALESCE(m.monetary, 0)  AS monetary
FROM recency r
LEFT JOIN freq f USING (user_id)
LEFT JOIN mon  m USING (user_id);

-- ----------------- 7. Materialised report views -------------------

DROP TABLE IF EXISTS ads.daily_kpi;
CREATE TABLE ads.daily_kpi AS
SELECT
  g.dt,
  g.gmv,
  g.paying_users,
  g.order_count,
  e.pv,
  e.cart,
  e.pay
FROM ads.gmv_daily g
LEFT JOIN (
  SELECT
    dt,
    SUM(CASE WHEN event_type='pv'   THEN 1 ELSE 0 END) AS pv,
    SUM(CASE WHEN event_type='cart' THEN 1 ELSE 0 END) AS cart,
    SUM(CASE WHEN event_type='pay'  THEN 1 ELSE 0 END) AS pay
  FROM dwd.user_events
  GROUP BY dt
) e ON g.dt = e.dt
ORDER BY g.dt;
