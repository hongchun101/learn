-- Module 02 / ch06 — read EXPLAIN plans
-- Run with: duckdb < modules/02-sql-advanced/src/ch06_explain.sql
-- Or interactive:  duckdb -c "EXPLAIN <query>"

CREATE SCHEMA IF NOT EXISTS ods;
CREATE OR REPLACE TABLE ods.orders AS
SELECT * FROM read_parquet('data/small/orders.parquet');

-- 1. Simple aggregation plan
EXPLAIN
SELECT user_id, COUNT(*) AS n, SUM(total) AS gmv
FROM ods.orders
WHERE status = 'completed'
GROUP BY user_id;

-- 2. Window function plan
EXPLAIN
SELECT user_id, total,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY total DESC) AS rk
FROM ods.orders;

-- 3. EXPLAIN ANALYZE: actually run, show timings
EXPLAIN ANALYZE
SELECT
  EXTRACT('month' FROM order_ts) AS mo,
  COUNT(*) AS n
FROM ods.orders
GROUP BY 1
ORDER BY 1;

-- 4. Join plan
EXPLAIN
SELECT o.order_id, u.user_name, o.total
FROM ods.orders o
JOIN read_parquet('data/small/users.parquet') u USING (user_id)
WHERE o.total > 100;

-- 5. Show the difference between a SEQ_SCAN and a filtered one
EXPLAIN
SELECT * FROM ods.orders WHERE order_id = 12345;
