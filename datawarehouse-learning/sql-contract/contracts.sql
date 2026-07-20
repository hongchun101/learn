-- sql-contract/contracts.sql
--
-- The cross-engine SQL contract. Every module in the curriculum must
-- produce a warehouse that satisfies these statements on the demo
-- dataset. The DuckDB reference implementation in reference_duckdb.sql
-- runs as-is; Hive / Spark / Trino / Flink modules port each statement
-- to their own dialect.
--
-- The contract is split into:
--   1. DDL — the layer / table contracts
--   2. ODS → DWD cleaning
--   3. DWD → DWS aggregation
--   4. SCD-2 dimension
--   5. DWS → ADS service
--   6. Quality assertions

-- =====================================================================
-- 1. DDL
-- =====================================================================

-- ODS: raw landing, one table per source.
CREATE SCHEMA IF NOT EXISTS ods;
-- ods.orders, ods.order_items, ods.products, ods.users, ods.user_events
-- are populated by the loader (see shared/generate_data.py).

-- DWD: cleaned, conformed.
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE TABLE IF NOT EXISTS dwd.orders AS
SELECT
  CAST(order_id   AS BIGINT)  AS order_id,
  CAST(user_id    AS BIGINT)  AS user_id,
  CAST(total      AS DECIMAL(18,2)) AS total,
  CAST(status     AS VARCHAR) AS status,
  CAST(order_date AS DATE)    AS dt,
  order_ts
FROM ods.orders
WHERE order_id IS NOT NULL AND user_id IS NOT NULL AND total IS NOT NULL;

CREATE TABLE IF NOT EXISTS dwd.order_items AS
SELECT
  CAST(item_id    AS BIGINT) AS item_id,
  CAST(order_id   AS BIGINT) AS order_id,
  CAST(product_id AS BIGINT) AS product_id,
  CAST(quantity   AS INTEGER) AS quantity,
  CAST(unit_price AS DECIMAL(18,2)) AS unit_price
FROM ods.order_items;

-- DWS: per-subject-per-day aggregates.
CREATE SCHEMA IF NOT EXISTS dws;
CREATE TABLE IF NOT EXISTS dws.user_order_1d AS
SELECT
  user_id,
  dt,
  COUNT(*)        AS order_count,
  SUM(total)      AS order_amount,
  COUNT(DISTINCT order_id) AS distinct_order_count
FROM dwd.orders
GROUP BY user_id, dt;

-- ADS: service-side wide table.
CREATE SCHEMA IF NOT EXISTS ads;
CREATE TABLE IF NOT EXISTS ads.gmv_daily AS
SELECT
  dt,
  SUM(order_amount) AS gmv,
  COUNT(DISTINCT user_id) AS paying_users
FROM dws.user_order_1d
GROUP BY dt;

-- =====================================================================
-- 2. ODS → DWD cleaning: the only transformations allowed
-- =====================================================================
--  - type casts
--  - null filtering
--  - status normalisation
--  - dedup by natural key (keep latest by ingest_ts)

-- =====================================================================
-- 3. DWD → DWS: aggregate, no joins across fact tables
-- =====================================================================

-- =====================================================================
-- 4. SCD-2 dimension
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS dim;
CREATE TABLE IF NOT EXISTS dim.user_scd2 (
  user_id        BIGINT,
  user_name      VARCHAR,
  level          VARCHAR,
  -- SCD-2 bookkeeping
  valid_from     DATE,
  valid_to       DATE,
  is_current     BOOLEAN
);

-- Seed: each user is current.
INSERT INTO dim.user_scd2
SELECT
  user_id, user_name, level,
  DATE '2024-01-01' AS valid_from,
  DATE '9999-12-31' AS valid_to,
  TRUE AS is_current
FROM ods.users;

-- =====================================================================
-- 5. DWS → ADS: business-facing projections
-- =====================================================================

-- =====================================================================
-- 6. Quality assertions (read-only)
-- =====================================================================

-- I.2.a  dwd row count <= ods row count
-- I.3.a  dws sum matches dwd sum
-- I.5.a  every dwd.user_id exists in dim.user_scd2
-- I.8.a  dwd total == dws total == ads gmv
