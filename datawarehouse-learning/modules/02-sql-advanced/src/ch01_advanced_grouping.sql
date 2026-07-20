-- Module 02 / ch01 — advanced aggregation
-- Run with: duckdb < modules/02-sql-advanced/src/ch01_advanced_grouping.sql

CREATE SCHEMA IF NOT EXISTS ods;
CREATE OR REPLACE TABLE ods.orders AS
SELECT * FROM read_parquet('data/small/orders.parquet');

-- (1) GROUPING SETS — multi-level rollup
SELECT
  status,
  EXTRACT('year'  FROM order_ts) AS yr,
  EXTRACT('month' FROM order_ts) AS mo,
  COUNT(*)        AS n,
  SUM(total)      AS gmv,
  GROUPING(status, EXTRACT('year' FROM order_ts), EXTRACT('month' FROM order_ts)) AS g
FROM ods.orders
GROUP BY GROUPING SETS (
  (status),
  (status, EXTRACT('year' FROM order_ts)),
  (status, EXTRACT('year' FROM order_ts), EXTRACT('month' FROM order_ts)),
  ()
)
ORDER BY g, status NULLS LAST, yr NULLS LAST, mo NULLS LAST
LIMIT 20;

-- (2) ROLLUP — hierarchical (year > month > day)
SELECT
  EXTRACT('year'  FROM order_ts) AS yr,
  EXTRACT('month' FROM order_ts) AS mo,
  COUNT(*) AS n,
  SUM(total) AS gmv
FROM ods.orders
GROUP BY ROLLUP (
  EXTRACT('year' FROM order_ts),
  EXTRACT('month' FROM order_ts)
)
ORDER BY yr NULLS LAST, mo NULLS LAST
LIMIT 20;

-- (3) HAVING — group-level filter
SELECT
  user_id,
  COUNT(*) AS n,
  SUM(total) AS gmv
FROM ods.orders
WHERE total > 0
GROUP BY user_id
HAVING COUNT(*) >= 3 AND SUM(total) > 500
ORDER BY gmv DESC
LIMIT 10;

-- (4) Approximate count distinct
SELECT
  approx_count_distinct(user_id) AS approx_users,
  COUNT(DISTINCT user_id)        AS exact_users
FROM ods.orders;
