-- Module 01 / ch02 — 3NF violations and fixes.
-- Run with: duckdb < modules/01-concepts/src/ex02_3nf.sql

-- BEFORE: violates 3NF (transitive dependency user_id -> user_name)
CREATE OR REPLACE TABLE orders_bad AS
SELECT
  o.order_id,
  o.user_id,
  u.user_name,           -- 冗余: user_name 决定于 user_id, 而非 order_id
  o.total,
  o.status
FROM read_parquet('data/small/orders.parquet') o
JOIN read_parquet('data/small/users.parquet')   u USING (user_id);

-- AFTER: split into dim + fact, restore 3NF
CREATE OR REPLACE TABLE dim_user AS
SELECT user_id, user_name, level, register_date
FROM read_parquet('data/small/users.parquet');

CREATE OR REPLACE TABLE fact_orders AS
SELECT order_id, user_id, total, status, order_date
FROM read_parquet('data/small/orders.parquet');

-- Verify: still produces the same join result
SELECT
  (SELECT COUNT(*) FROM orders_bad) AS before_n,
  (SELECT COUNT(*) FROM fact_orders) AS after_n;
