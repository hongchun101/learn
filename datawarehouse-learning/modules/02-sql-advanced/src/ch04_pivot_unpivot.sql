-- Module 02 / ch04 — PIVOT / UNPIVOT
-- Run with: duckdb < modules/02-sql-advanced/src/ch04_pivot_unpivot.sql

CREATE SCHEMA IF NOT EXISTS ods;
CREATE OR REPLACE TABLE ods.orders AS
SELECT * FROM read_parquet('data/small/orders.parquet');

-- (1) PIVOT: one column per status
SELECT * FROM (
  SELECT user_id, status, total FROM ods.orders
)
PIVOT (
  SUM(total) FOR status IN ('completed', 'paid', 'shipped', 'cancelled')
) AS p (user_id, completed, paid, shipped, cancelled)
ORDER BY user_id
LIMIT 10;

-- (2) UNPIVOT: back to long
WITH p AS (
  SELECT * FROM (
    SELECT user_id, status, total FROM ods.orders WHERE user_id <= 10
  )
  PIVOT (
    SUM(total) FOR status IN ('completed', 'paid', 'shipped', 'cancelled')
  ) AS p (user_id, completed, paid, shipped, cancelled)
)
SELECT user_id, status, total
FROM p
UNPIVOT (
  total FOR status IN (completed, paid, shipped, cancelled)
)
ORDER BY user_id, status
LIMIT 20;

-- (3) Trino-style: PIVOT with CASE WHEN (works on any engine)
SELECT
  user_id,
  SUM(CASE WHEN status='completed' THEN total END) AS completed,
  SUM(CASE WHEN status='paid'      THEN total END) AS paid,
  SUM(CASE WHEN status='shipped'   THEN total END) AS shipped,
  SUM(CASE WHEN status='cancelled' THEN total END) AS cancelled
FROM ods.orders
GROUP BY user_id
ORDER BY user_id
LIMIT 10;
