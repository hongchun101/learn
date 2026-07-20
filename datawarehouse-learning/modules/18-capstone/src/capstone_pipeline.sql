CREATE SCHEMA IF NOT EXISTS ods;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS dws;
CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS dim;
CREATE SCHEMA IF NOT EXISTS dwt;

DROP TABLE IF EXISTS dwd.orders;
CREATE TABLE dwd.orders AS
SELECT
  order_id,
  user_id,
  CAST(total AS DECIMAL(18, 2)) AS total,
  CASE
    WHEN status IN ('created', 'paid', 'shipped', 'completed', 'cancelled', 'refunded') THEN status
    ELSE 'unknown'
  END AS status,
  CAST(order_date AS DATE) AS dt,
  order_ts
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY order_ts DESC) AS _rn
  FROM ods.orders
  WHERE order_id IS NOT NULL
    AND user_id IS NOT NULL
    AND total IS NOT NULL
) AS dedup
WHERE _rn = 1;

DROP TABLE IF EXISTS dwd.order_items;
CREATE TABLE dwd.order_items AS
SELECT
  item_id,
  order_id,
  product_id,
  quantity,
  CAST(unit_price AS DECIMAL(18, 2)) AS unit_price
FROM ods.order_items
WHERE item_id IS NOT NULL
  AND order_id IS NOT NULL;

DROP TABLE IF EXISTS dwd.user_events;
CREATE TABLE dwd.user_events AS
SELECT
  event_id,
  user_id,
  CASE
    WHEN event_type IN ('pv', 'cart', 'fav', 'pay') THEN event_type
    ELSE 'other'
  END AS event_type,
  page,
  event_ts,
  CAST(event_ts AS DATE) AS dt
FROM ods.user_events
WHERE event_id IS NOT NULL
  AND user_id IS NOT NULL;

DROP TABLE IF EXISTS dim.user_scd2;
CREATE TABLE dim.user_scd2 AS
SELECT
  user_id,
  user_name,
  level,
  CAST(register_date AS DATE) AS register_date,
  DATE '2024-01-01' AS valid_from,
  DATE '9999-12-31' AS valid_to,
  TRUE AS is_current
FROM ods.users;

DROP TABLE IF EXISTS dws.user_order_1d;
CREATE TABLE dws.user_order_1d AS
SELECT
  user_id,
  dt,
  COUNT(*) AS order_count,
  SUM(total) AS order_amount,
  COUNT(DISTINCT order_id) AS distinct_order_count,
  SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END) AS gmv
FROM dwd.orders
GROUP BY user_id, dt;

DROP TABLE IF EXISTS dws.product_sales_1d;
CREATE TABLE dws.product_sales_1d AS
SELECT
  i.product_id,
  o.dt,
  SUM(i.quantity) AS qty_sum,
  SUM(i.quantity * i.unit_price) AS gmv
FROM dwd.order_items AS i
JOIN dwd.orders AS o ON i.order_id = o.order_id
GROUP BY i.product_id, o.dt;

DROP TABLE IF EXISTS dwt.user_topic;
CREATE TABLE dwt.user_topic AS
SELECT
  user_id,
  MIN(dt) AS first_order_dt,
  MAX(dt) AS last_order_dt,
  COUNT(DISTINCT dt) AS active_days,
  SUM(order_count) AS lifetime_orders,
  SUM(order_amount) AS lifetime_amount
FROM dws.user_order_1d
GROUP BY user_id;

DROP TABLE IF EXISTS ads.gmv_daily;
CREATE TABLE ads.gmv_daily AS
SELECT
  dt,
  SUM(order_amount) AS gmv,
  COUNT(DISTINCT user_id) AS paying_users,
  SUM(order_count) AS order_count
FROM dws.user_order_1d
GROUP BY dt
ORDER BY dt;

DROP TABLE IF EXISTS ads.user_rfm;
CREATE TABLE ads.user_rfm AS
WITH snapshot AS (
  SELECT MAX(dt) AS snapshot_dt
  FROM dws.user_order_1d
),
rfm_raw AS (
  SELECT
    u.user_id,
    CASE
      WHEN MAX(o.dt) IS NULL THEN 9999
      ELSE CAST((SELECT snapshot_dt FROM snapshot) - MAX(o.dt) AS INTEGER)
    END AS recency_days,
    COUNT(DISTINCT o.order_id) AS frequency,
    CAST(COALESCE(SUM(o.total), 0) AS DECIMAL(18, 2)) AS monetary
  FROM ods.users AS u
  LEFT JOIN dwd.orders AS o ON u.user_id = o.user_id
  GROUP BY u.user_id
),
rfm_scored AS (
  SELECT
    *,
    NTILE(5) OVER (ORDER BY recency_days DESC, user_id) AS r_score,
    NTILE(5) OVER (ORDER BY frequency ASC, user_id) AS f_score,
    NTILE(5) OVER (ORDER BY monetary ASC, user_id) AS m_score
  FROM rfm_raw
)
SELECT
  user_id,
  recency_days,
  frequency,
  monetary,
  r_score,
  f_score,
  m_score,
  CAST(r_score AS VARCHAR) || CAST(f_score AS VARCHAR) || CAST(m_score AS VARCHAR) AS rfm_code,
  CASE
    WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'champions'
    WHEN r_score >= 3 AND f_score >= 3 THEN 'loyal'
    WHEN r_score >= 4 AND f_score <= 2 THEN 'potential'
    WHEN r_score <= 2 AND f_score >= 3 THEN 'at_risk'
    ELSE 'regular'
  END AS segment
FROM rfm_scored;

DROP TABLE IF EXISTS ads.daily_kpi;
CREATE TABLE ads.daily_kpi AS
WITH event_daily AS (
  SELECT
    dt,
    SUM(CASE WHEN event_type = 'pv' THEN 1 ELSE 0 END) AS pv,
    SUM(CASE WHEN event_type = 'cart' THEN 1 ELSE 0 END) AS cart,
    SUM(CASE WHEN event_type = 'pay' THEN 1 ELSE 0 END) AS pay
  FROM dwd.user_events
  GROUP BY dt
),
order_daily AS (
  SELECT
    dt,
    SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END) AS completed_gmv,
    SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refund_orders
  FROM dwd.orders
  GROUP BY dt
)
SELECT
  g.dt,
  g.gmv,
  g.paying_users,
  g.order_count,
  o.completed_gmv,
  o.refund_orders,
  COALESCE(e.pv, 0) AS pv,
  COALESCE(e.cart, 0) AS cart,
  COALESCE(e.pay, 0) AS pay,
  ROUND(g.gmv / NULLIF(g.order_count, 0), 2) AS average_order_value,
  ROUND(100.0 * COALESCE(e.pay, 0) / NULLIF(e.pv, 0), 2) AS pay_conversion_pct,
  ROUND(100.0 * o.refund_orders / NULLIF(g.order_count, 0), 2) AS refund_rate_pct
FROM ads.gmv_daily AS g
LEFT JOIN event_daily AS e ON g.dt = e.dt
LEFT JOIN order_daily AS o ON g.dt = o.dt
ORDER BY g.dt;

DROP TABLE IF EXISTS ads.order_anomalies;
CREATE TABLE ads.order_anomalies AS
WITH scored AS (
  SELECT
    order_id,
    user_id,
    dt,
    total,
    AVG(total) OVER (PARTITION BY user_id) AS user_avg_amount,
    COUNT(*) OVER (PARTITION BY user_id) AS user_order_count
  FROM dwd.orders
)
SELECT
  order_id,
  user_id,
  dt,
  total,
  CAST(user_avg_amount AS DECIMAL(18, 2)) AS user_avg_amount,
  user_order_count,
  ROUND(total / NULLIF(user_avg_amount, 0), 2) AS amount_to_average_ratio,
  total > 10 * user_avg_amount AS is_anomaly
FROM scored;

DROP TABLE IF EXISTS ads.data_quality_audit;
CREATE TABLE ads.data_quality_audit AS
SELECT
  'dwd_order_key_not_null' AS check_name,
  'error' AS severity,
  COUNT(*) AS violation_count
FROM dwd.orders
WHERE order_id IS NULL OR user_id IS NULL
UNION ALL
SELECT
  'dwd_order_total_range',
  'error',
  COUNT(*)
FROM dwd.orders
WHERE total < 0 OR total > 1000000
UNION ALL
SELECT
  'dwd_order_status_domain',
  'error',
  COUNT(*)
FROM dwd.orders
WHERE status NOT IN ('created', 'paid', 'shipped', 'completed', 'cancelled', 'refunded')
UNION ALL
SELECT
  'dws_user_day_unique',
  'error',
  COUNT(*)
FROM (
  SELECT user_id, dt
  FROM dws.user_order_1d
  GROUP BY user_id, dt
  HAVING COUNT(*) > 1
) AS duplicates
UNION ALL
SELECT
  'order_user_referential_integrity',
  'error',
  COUNT(*)
FROM dwd.orders AS o
LEFT JOIN dim.user_scd2 AS u
  ON o.user_id = u.user_id AND u.is_current
WHERE u.user_id IS NULL
UNION ALL
SELECT
  'dwd_dws_ads_amount_reconciliation',
  'error',
  CASE
    WHEN ABS(
      (SELECT SUM(total) FROM dwd.orders)
      - (SELECT SUM(order_amount) FROM dws.user_order_1d)
    ) > 0.01
      OR ABS(
        (SELECT SUM(total) FROM dwd.orders)
        - (SELECT SUM(gmv) FROM ads.gmv_daily)
      ) > 0.01
    THEN 1
    ELSE 0
  END;
