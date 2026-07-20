-- Module 01 / ch07 — One Big Table (OBT)
-- Run with: duckdb < modules/01-concepts/src/ex07_obt.sql

-- Materialise a per-user wide feature table suitable for ML
-- training or a real-time serving layer.
CREATE SCHEMA IF NOT EXISTS ads;
CREATE OR REPLACE TABLE ads.user_obt AS
WITH user_orders AS (
  SELECT
    user_id,
    COUNT(*)             AS order_count_total,
    SUM(total)           AS order_amount_total,
    MAX(dt)              AS last_order_dt,
    MIN(dt)              AS first_order_dt
  FROM (
    SELECT
      order_id, user_id, total,
      CAST(order_date AS DATE) AS dt
    FROM read_parquet('data/small/orders.parquet')
  )
  GROUP BY user_id
),
user_events AS (
  SELECT
    user_id,
    SUM(CASE WHEN event_type='pv'   THEN 1 ELSE 0 END) AS pv_count,
    SUM(CASE WHEN event_type='cart' THEN 1 ELSE 0 END) AS cart_count,
    SUM(CASE WHEN event_type='fav'  THEN 1 ELSE 0 END) AS fav_count,
    SUM(CASE WHEN event_type='pay'  THEN 1 ELSE 0 END) AS pay_count
  FROM read_parquet('data/small/user_events.parquet')
  GROUP BY user_id
)
SELECT
  u.user_id,
  u.user_name,
  u.level,
  u.age,
  u.gender,
  COALESCE(o.order_count_total, 0)  AS order_count_total,
  COALESCE(o.order_amount_total, 0) AS order_amount_total,
  o.last_order_dt,
  o.first_order_dt,
  COALESCE(e.pv_count, 0)    AS pv_count,
  COALESCE(e.cart_count, 0)  AS cart_count,
  COALESCE(e.fav_count, 0)   AS fav_count,
  COALESCE(e.pay_count, 0)   AS pay_count
FROM read_parquet('data/small/users.parquet') u
LEFT JOIN user_orders o USING (user_id)
LEFT JOIN user_events e USING (user_id);

-- Sample
SELECT * FROM ads.user_obt LIMIT 3;
