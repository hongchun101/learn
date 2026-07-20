-- Module 02 / ch08 — 50 SQL exercises with reference answers.
-- Run with: duckdb < modules/02-sql-advanced/src/exercises.sql

CREATE SCHEMA IF NOT EXISTS ods;
CREATE OR REPLACE TABLE ods.orders      AS SELECT * FROM read_parquet('data/small/orders.parquet');
CREATE OR REPLACE TABLE ods.users       AS SELECT * FROM read_parquet('data/small/users.parquet');
CREATE OR REPLACE TABLE ods.products    AS SELECT * FROM read_parquet('data/small/products.parquet');
CREATE OR REPLACE TABLE ods.order_items AS SELECT * FROM read_parquet('data/small/order_items.parquet');
CREATE OR REPLACE TABLE ods.user_events AS SELECT * FROM read_parquet('data/small/user_events.parquet');

-- ============================================================
-- A. basic (1-10)
-- ============================================================

-- 1. 每个用户的总订单金额
SELECT user_id, SUM(total) AS gmv FROM ods.orders GROUP BY user_id LIMIT 5;

-- 2. 每个用户最近的订单
SELECT user_id, order_id, total
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_ts DESC) rn
  FROM ods.orders
) WHERE rn = 1 LIMIT 5;

-- 3. 每个 category 的 GMV
SELECT p.category, SUM(i.quantity * i.unit_price) AS gmv
FROM ods.order_items i
JOIN ods.products p USING (product_id)
GROUP BY 1 ORDER BY 2 DESC LIMIT 5;

-- 4. 每个 category 的活跃用户数
SELECT p.category, COUNT(DISTINCT o.user_id) AS users
FROM ods.orders o
JOIN ods.order_items i ON o.order_id = i.order_id
JOIN ods.products p ON i.product_id = p.product_id
GROUP BY 1 ORDER BY 2 DESC LIMIT 5;

-- 5. 每月新用户数
SELECT
  DATE_TRUNC('month', register_date) AS month,
  COUNT(*) AS new_users
FROM ods.users
GROUP BY 1 ORDER BY 1 LIMIT 5;

-- 6. 复购率
SELECT
  ROUND(100.0 * SUM(CASE WHEN n >= 2 THEN 1 ELSE 0 END) / COUNT(*), 2) AS repeat_pct
FROM (
  SELECT user_id, COUNT(*) AS n FROM ods.orders GROUP BY user_id
);

-- 7. 客单价
SELECT AVG(order_total) AS aov FROM (
  SELECT order_id, SUM(total) AS order_total FROM ods.orders GROUP BY 1
);

-- 8. 订单状态分布
SELECT status, COUNT(*) AS n, SUM(total) AS gmv
FROM ods.orders GROUP BY status ORDER BY 2 DESC;

-- 9. 每个用户的首单和末单
SELECT
  user_id,
  MIN(order_ts) AS first_ts,
  MAX(order_ts) AS last_ts
FROM ods.orders GROUP BY user_id LIMIT 5;

-- 10. 每个 category 的 AOV
SELECT p.category, AVG(o.total) AS aov
FROM ods.orders o
JOIN ods.order_items i ON o.order_id = i.order_id
JOIN ods.products p ON i.product_id = p.product_id
GROUP BY 1 ORDER BY 2 DESC LIMIT 5;

-- ============================================================
-- B. window (11-20)
-- ============================================================

-- 11. 每个用户最近 3 笔订单
SELECT user_id, order_id, total FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_ts DESC) rn
  FROM ods.orders
) WHERE rn <= 3 ORDER BY user_id, rn LIMIT 9;

-- 12. 每个用户第 2 单的金额
SELECT user_id, total FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_ts) rn
  FROM ods.orders
) WHERE rn = 2 LIMIT 5;

-- 13. 累计 GMV
SELECT
  CAST(order_date AS DATE) AS dt,
  SUM(total) AS daily_gmv,
  SUM(SUM(total)) OVER (ORDER BY CAST(order_date AS DATE)) AS cum_gmv
FROM ods.orders GROUP BY 1 ORDER BY 1 LIMIT 5;

-- 14. 7 日移动平均
SELECT
  dt, gmv,
  AVG(gmv) OVER (ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma7
FROM (
  SELECT CAST(order_date AS DATE) AS dt, SUM(total) AS gmv
  FROM ods.orders GROUP BY 1
) ORDER BY dt LIMIT 10;

-- 15. 上一单金额
SELECT user_id, order_id, total,
  LAG(total) OVER (PARTITION BY user_id ORDER BY order_ts) AS prev_total
FROM ods.orders LIMIT 10;

-- 16. 帕累托
WITH lifetime AS (
  SELECT user_id, SUM(total) AS amt FROM ods.orders GROUP BY 1
)
SELECT
  user_id, amt,
  SUM(amt) OVER (ORDER BY amt DESC) / SUM(amt) OVER () AS cum_pct
FROM lifetime ORDER BY amt DESC LIMIT 10;

-- 17. 同比
SELECT
  EXTRACT('month' FROM order_ts) AS mo,
  SUM(total) FILTER (EXTRACT('year' FROM order_ts) = 2024) AS y2024,
  SUM(total) FILTER (EXTRACT('year' FROM order_ts) = 2023) AS y2023
FROM ods.orders GROUP BY 1 ORDER BY 1 LIMIT 5;

-- 18. 连续登录
WITH login_days AS (
  SELECT DISTINCT user_id, CAST(event_ts AS DATE) AS dt
  FROM ods.user_events WHERE event_type = 'pay'
),
ranked AS (
  SELECT user_id, dt,
    dt - INTERVAL (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY dt)) DAY AS grp
  FROM login_days
)
SELECT user_id, MIN(dt) AS start_dt, MAX(dt) AS end_dt, COUNT(*) AS days
FROM ranked
GROUP BY user_id, grp
HAVING COUNT(*) >= 3
ORDER BY days DESC LIMIT 5;

-- 19. 留存 D+1
WITH first_event AS (
  SELECT user_id, MIN(CAST(event_ts AS DATE)) AS d0
  FROM ods.user_events GROUP BY user_id
)
SELECT
  COUNT(DISTINCT CASE WHEN e.dt = f.d0 + INTERVAL 1 DAY THEN e.user_id END) * 1.0
  / COUNT(DISTINCT f.user_id) AS d1_retention
FROM first_event f
LEFT JOIN (
  SELECT DISTINCT user_id, CAST(event_ts AS DATE) AS dt
  FROM ods.user_events
) e USING (user_id);

-- 20. 漏斗 pv->cart->pay
SELECT
  COUNT(DISTINCT user_id) FILTER (event_type='pv')   AS pv_users,
  COUNT(DISTINCT user_id) FILTER (event_type='cart') AS cart_users,
  COUNT(DISTINCT user_id) FILTER (event_type='pay')  AS pay_users
FROM ods.user_events;
