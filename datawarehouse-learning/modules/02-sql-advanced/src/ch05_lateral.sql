-- Module 02 / ch05 — LATERAL and per-row subqueries
-- Run with: duckdb < modules/02-sql-advanced/src/ch05_lateral.sql

CREATE SCHEMA IF NOT EXISTS ods;
CREATE OR REPLACE TABLE ods.orders AS
SELECT * FROM read_parquet('data/small/orders.parquet');
CREATE OR REPLACE TABLE ods.users AS
SELECT * FROM read_parquet('data/small/users.parquet');

-- (1) Top-3 orders per user via LATERAL
SELECT u.user_id, u.user_name, r.order_id, r.total, r.order_ts
FROM ods.users u
LEFT JOIN LATERAL (
  SELECT order_id, total, order_ts
  FROM ods.orders o
  WHERE o.user_id = u.user_id
  ORDER BY order_ts DESC
  LIMIT 3
) r ON TRUE
WHERE u.user_id <= 5
ORDER BY u.user_id, r.order_ts DESC;

-- (2) Equivalent without LATERAL (works on any engine)
SELECT u.user_id, u.user_name, r.order_id, r.total, r.order_ts
FROM ods.users u
LEFT JOIN (
  SELECT o.*, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_ts DESC) rn
  FROM ods.orders o
) r ON r.user_id = u.user_id AND r.rn <= 3
WHERE u.user_id <= 5
ORDER BY u.user_id, r.order_ts DESC;
