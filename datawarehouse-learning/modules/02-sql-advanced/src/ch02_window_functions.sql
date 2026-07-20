-- Module 02 / ch02 — window functions
-- Run with: duckdb < modules/02-sql-advanced/src/ch02_window_functions.sql

CREATE SCHEMA IF NOT EXISTS ods;
CREATE OR REPLACE TABLE ods.orders AS
SELECT * FROM read_parquet('data/small/orders.parquet');
CREATE OR REPLACE TABLE ods.user_events AS
SELECT * FROM read_parquet('data/small/user_events.parquet');

-- (1) row_number: each user's first order
SELECT user_id, order_id, total, order_ts
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_ts) AS rn
  FROM ods.orders
)
WHERE rn = 1
ORDER BY user_id
LIMIT 5;

-- (2) rank vs dense_rank
SELECT
  user_id, total,
  RANK()       OVER (ORDER BY total DESC) AS rk,
  DENSE_RANK() OVER (ORDER BY total DESC) AS drk,
  PERCENT_RANK() OVER (ORDER BY total)    AS pct
FROM ods.orders
ORDER BY total DESC
LIMIT 10;

-- (3) lag/lead — previous and next order amount
SELECT
  user_id, order_id, total, order_ts,
  LAG(total, 1)  OVER (PARTITION BY user_id ORDER BY order_ts) AS prev_total,
  LEAD(total, 1) OVER (PARTITION BY user_id ORDER BY order_ts) AS next_total
FROM ods.orders
ORDER BY user_id, order_ts
LIMIT 10;

-- (4) cumulative sum
SELECT
  dt, order_amount,
  SUM(order_amount) OVER (ORDER BY dt) AS cum_gmv
FROM (
  SELECT
    CAST(order_date AS DATE) AS dt,
    SUM(total) AS order_amount
  FROM ods.orders
  GROUP BY 1
)
ORDER BY dt
LIMIT 10;

-- (5) moving average (7-day)
SELECT
  dt, order_amount,
  AVG(order_amount) OVER (
    ORDER BY dt
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS ma7
FROM (
  SELECT
    CAST(order_date AS DATE) AS dt,
    SUM(total) AS order_amount
  FROM ods.orders
  GROUP BY 1
)
ORDER BY dt
LIMIT 15;

-- (6) first_value / last_value / nth_value
SELECT
  user_id, total,
  FIRST_VALUE(total) OVER (PARTITION BY user_id ORDER BY total DESC) AS max_total,
  LAST_VALUE(total)  OVER (
    PARTITION BY user_id ORDER BY total DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  ) AS min_total,
  NTH_VALUE(total, 2) OVER (
    PARTITION BY user_id ORDER BY total DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  ) AS second_max_total
FROM ods.orders
LIMIT 10;

-- (7) gap-and-island: continuous login days
SELECT
  user_id, dt,
  dt - INTERVAL (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY dt)) DAY AS grp
FROM (
  SELECT DISTINCT
    user_id,
    CAST(event_ts AS DATE) AS dt
  FROM ods.user_events
  WHERE event_type = 'pay'
)
LIMIT 10;

-- (8) top-N per group with ntile
SELECT
  user_id, total,
  NTILE(4) OVER (PARTITION BY user_id ORDER BY total DESC) AS quartile
FROM ods.orders
ORDER BY user_id, total DESC
LIMIT 20;
