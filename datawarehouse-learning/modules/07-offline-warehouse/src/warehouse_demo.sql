-- =============================================================================
--  Module 07 — Offline Data Warehouse Demo
--  Pipeline: ODS -> DWD -> DWS -> DWT -> ADS
--  Engine  : DuckDB (reference engine for this curriculum)
--  Domain  : e-commerce (orders, order_items, products, users, user_events)
--
--  Layout:
--    ods.*           raw, parquet-loaded by the harness
--    dwd.*           cleaned, conformed, enriched with dimension keys
--    dws.*           daily subject aggregates (one row per day per subject)
--    dwt.*           cumulative snapshots across all history per subject
--    ads.*           application-facing indicators (GMV, dau, conversion ...)
--
--  Conventions in this file:
--    - Use CREATE OR REPLACE TABLE so re-runs are idempotent.
--    - DuckDB does NOT support `CREATE OR REPLACE SCHEMA`. We use plain
--      `CREATE SCHEMA IF NOT EXISTS` (the loader also creates ods).
--    - One business fact: GMV = sum(orders.total) WHERE status <> 'cancelled'.
--      Every layer must reproduce the same GMV so layers can be reconciled.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ODS — Operational Data Store
--   Schema is owned by the loader (SqlRunner.load_data), but we explicitly
--   surface the raw tables here for clarity. A real warehouse would also add
--   dt partition columns and an etl_time audit column at this layer.
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS ods;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS dws;
CREATE SCHEMA IF NOT EXISTS dwt;
CREATE SCHEMA IF NOT EXISTS ads;

-- dt partitions (simulate partition pruning). Real systems store parquet
-- under /ods/orders/dt=YYYY-MM-DD/. For DuckDB we just expose a dt column
-- derived from order_ts so partition pruning tests have a column to probe.
CREATE OR REPLACE TABLE ods.orders_part AS
SELECT
    order_id,
    user_id,
    total,
    status,
    order_date,
    order_ts,
    CAST(order_ts AS DATE)                       AS dt,
    EXTRACT('year'  FROM order_ts)::INT          AS dt_year,
    EXTRACT('month' FROM order_ts)::INT          AS dt_month
FROM ods.orders;
SELECT COUNT(*) AS orders_part_cnt FROM ods.orders_part;

CREATE OR REPLACE TABLE ods.order_items_part AS
SELECT
    item_id,
    order_id,
    product_id,
    quantity,
    unit_price,
    CAST(quantity * unit_price AS DOUBLE)        AS gross_amount,
    CAST(order_id AS BIGINT)                     AS order_id_bk
FROM ods.order_items;
SELECT COUNT(*) AS order_items_part_cnt FROM ods.order_items_part;

CREATE OR REPLACE TABLE ods.user_events_part AS
SELECT
    event_id,
    user_id,
    event_type,
    page,
    event_ts,
    CAST(event_ts AS DATE)                       AS dt
FROM ods.user_events;
SELECT COUNT(*) AS user_events_part_cnt FROM ods.user_events_part;

-- -----------------------------------------------------------------------------
-- DWD — Data Warehouse Detail
--   Goals:
--     1. conform types / nulls
--     2. drop or quarantine bad rows (NULL PK, negative quantity, ...)
--     3. add surrogate keys + business keys
--     4. enrich with slowly-changing dimension (SCD-2) lookups
--
--   Conformed dimensions:
--     dim_user_scd2  — user history with effective_from / effective_to
-- -----------------------------------------------------------------------------

-- SCD-2 dimension. We pretend that 'level' changed for half of the users at a
-- fixed point in 2024. The dimension therefore has two active rows for those
-- users, and exactly one row for users that never changed.
CREATE OR REPLACE TABLE dwd.dim_user_scd2 AS
WITH base AS (
    SELECT
        user_id,
        user_name,
        level,
        register_date,
        age,
        gender,
        register_date                                   AS effective_from,
        CAST('9999-12-31' AS DATE)                      AS effective_to,
        TRUE                                            AS is_current
    FROM ods.users
),
split AS (
    SELECT
        user_id, user_name, level, register_date, age, gender,
        effective_from, effective_to, is_current
    FROM base
    WHERE user_id % 2 = 1
    UNION ALL
    SELECT
        user_id, user_name, level, register_date, age, gender,
        register_date                                   AS effective_from,
        CAST('2024-06-30' AS DATE)                      AS effective_to,
        FALSE                                           AS is_current
    FROM ods.users
    WHERE user_id % 2 = 0
    UNION ALL
    SELECT
        user_id,
        user_name,
        CASE level WHEN 'silver' THEN 'gold'
                   WHEN 'gold'   THEN 'platinum'
                   ELSE level END                       AS level,
        register_date,
        age, gender,
        CAST('2024-07-01' AS DATE)                      AS effective_from,
        CAST('9999-12-31' AS DATE)                      AS effective_to,
        TRUE                                            AS is_current
    FROM ods.users
    WHERE user_id % 2 = 0
)
SELECT
    ROW_NUMBER() OVER (ORDER BY user_id, effective_from)   AS user_sk,
    user_id,
    user_name,
    level,
    register_date,
    age,
    gender,
    effective_from,
    effective_to,
    is_current
FROM split;
SELECT COUNT(*) AS scd2_cnt FROM dwd.dim_user_scd2;

-- Conformed product dimension (SCD-1 — current snapshot only).
CREATE OR REPLACE TABLE dwd.dim_product AS
SELECT
    ROW_NUMBER() OVER (ORDER BY product_id)               AS product_sk,
    product_id,
    product_name,
    category,
    sub_category,
    price
FROM ods.products;
SELECT COUNT(*) AS dim_product_cnt FROM dwd.dim_product;

-- Fact: cleaned orders. Drop orders with missing PK / negative total. Add a
-- partition-friendly dt column. Status is normalised to lower case.
CREATE OR REPLACE TABLE dwd.dwd_orders AS
SELECT
    o.order_id,
    o.user_id,
    o.total                                            AS order_amount,
    LOWER(TRIM(o.status))                              AS order_status,
    o.order_ts,
    CAST(o.order_ts AS DATE)                           AS dt,
    EXTRACT('year'  FROM o.order_ts)::INT              AS dt_year,
    EXTRACT('month' FROM o.order_ts)::INT              AS dt_month
FROM ods.orders o
WHERE o.order_id IS NOT NULL
  AND o.user_id  IS NOT NULL
  AND o.total    IS NOT NULL
  AND o.total    >= 0;
SELECT COUNT(*) AS dwd_orders_cnt FROM dwd.dwd_orders;

-- Fact: cleaned order items.
CREATE OR REPLACE TABLE dwd.dwd_order_items AS
SELECT
    i.item_id,
    i.order_id,
    i.product_id,
    i.quantity,
    i.unit_price,
    CAST(i.quantity * i.unit_price AS DOUBLE)          AS gross_amount
FROM ods.order_items i
WHERE i.item_id   IS NOT NULL
  AND i.order_id  IS NOT NULL
  AND i.product_id IS NOT NULL
  AND i.quantity  > 0
  AND i.unit_price >= 0;
SELECT COUNT(*) AS dwd_order_items_cnt FROM dwd.dwd_order_items;

-- Fact: cleaned user events.
CREATE OR REPLACE TABLE dwd.dwd_user_events AS
SELECT
    event_id,
    user_id,
    LOWER(TRIM(event_type))                            AS event_type,
    page,
    event_ts,
    CAST(event_ts AS DATE)                             AS dt
FROM ods.user_events
WHERE event_id IS NOT NULL
  AND user_id  IS NOT NULL
  AND event_type IS NOT NULL;
SELECT COUNT(*) AS dwd_user_events_cnt FROM dwd.dwd_user_events;

-- -----------------------------------------------------------------------------
-- DWS — Data Warehouse Summary (daily grain, per subject)
--   One row per (dt, user_id) summarising that user's activity that day.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE dws.dws_user_order_day AS
SELECT
    dt,
    user_id,
    dt_year,
    dt_month,
    COUNT(*)                                           AS order_cnt,
    SUM(CASE WHEN order_status = 'completed' THEN order_amount ELSE 0 END)
                                                        AS gmv_completed,
    SUM(CASE WHEN order_status = 'created'   THEN order_amount ELSE 0 END)
                                                        AS gmv_created,
    SUM(CASE WHEN order_status <> 'cancelled' THEN order_amount ELSE 0 END)
                                                        AS gmv_net,
    SUM(CASE WHEN order_status = 'cancelled' THEN order_amount ELSE 0 END)
                                                        AS gmv_cancelled
FROM dwd.dwd_orders
GROUP BY dt, user_id, dt_year, dt_month;
SELECT COUNT(*) AS dws_user_order_day_cnt FROM dws.dws_user_order_day;

CREATE OR REPLACE TABLE dws.dws_user_event_day AS
SELECT
    dt,
    user_id,
    SUM(CASE WHEN event_type = 'pv'   THEN 1 ELSE 0 END)   AS pv_cnt,
    SUM(CASE WHEN event_type = 'cart' THEN 1 ELSE 0 END)   AS cart_cnt,
    SUM(CASE WHEN event_type = 'pay'  THEN 1 ELSE 0 END)   AS pay_cnt,
    SUM(CASE WHEN event_type = 'fav'  THEN 1 ELSE 0 END)   AS fav_cnt,
    COUNT(*)                                               AS event_cnt
FROM dwd.dwd_user_events
GROUP BY dt, user_id;
SELECT COUNT(*) AS dws_user_event_day_cnt FROM dws.dws_user_event_day;

-- -----------------------------------------------------------------------------
-- DWT — Data Warehouse Topic (cumulative per subject across full history)
--   One row per subject (user). Used by ADS for "lifetime" metrics that
--   should not be recomputed from scratch every day.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE dwt.dwt_user_lifecycle AS
SELECT
    user_id,
    COUNT(*)                                       AS lifetime_order_cnt,
    SUM(CASE WHEN order_status = 'completed' THEN order_amount ELSE 0 END)
                                                    AS lifetime_gmv_completed,
    SUM(CASE WHEN order_status <> 'cancelled' THEN order_amount ELSE 0 END)
                                                    AS lifetime_gmv_net,
    MIN(dt)                                        AS first_order_dt,
    MAX(dt)                                        AS last_order_dt
FROM dwd.dwd_orders
GROUP BY user_id;
SELECT COUNT(*) AS dwt_user_lifecycle_cnt FROM dwt.dwt_user_lifecycle;

-- -----------------------------------------------------------------------------
-- ADS — Application Data Service
--   Final indicators consumed by BI / reporting. Every ADS metric that should
--   reconcile to DWS / DWT must use the SAME definition of GMV.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE ads.ads_gmv_daily AS
SELECT
    dt,
    SUM(gmv_net)                                   AS gmv,
    SUM(gmv_completed)                             AS gmv_completed,
    SUM(order_cnt)                                 AS order_cnt,
    COUNT(DISTINCT user_id)                        AS buyer_cnt
FROM dws.dws_user_order_day
GROUP BY dt;
SELECT COUNT(*) AS ads_gmv_daily_cnt FROM ads.ads_gmv_daily;

CREATE OR REPLACE TABLE ads.ads_user_lifetime AS
SELECT
    user_id,
    lifetime_order_cnt,
    lifetime_gmv_net                               AS gmv,
    lifetime_gmv_completed                         AS gmv_completed
FROM dwt.dwt_user_lifecycle;
SELECT COUNT(*) AS ads_user_lifetime_cnt FROM ads.ads_user_lifetime;

-- Headline figure the business reports each morning.
CREATE OR REPLACE TABLE ads.ads_overall_kpi AS
SELECT
    (SELECT SUM(gmv)            FROM ads.ads_gmv_daily)     AS total_gmv,
    (SELECT SUM(order_cnt)      FROM ads.ads_gmv_daily)     AS total_orders,
    (SELECT SUM(buyer_cnt)      FROM ads.ads_gmv_daily)     AS total_buyers,
    (SELECT SUM(gmv)            FROM ads.ads_user_lifetime) AS lifetime_gmv,
    (SELECT COUNT(*)            FROM ads.ads_user_lifetime) AS lifetime_buyers;
SELECT total_gmv, lifetime_gmv FROM ads.ads_overall_kpi;

-- Convenience: explicit "no-op" anchor so _split_statements does not strip the
-- tail of the file. Every CTE / view / table is materialised above.
SELECT 1 AS pipeline_complete;