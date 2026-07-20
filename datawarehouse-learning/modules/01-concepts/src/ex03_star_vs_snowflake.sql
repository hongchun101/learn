-- Module 01 / ch03 — star schema vs snowflake schema.

-- ============================================================
-- (1) Star schema: one fact, four dimensions, no nesting
-- ============================================================
CREATE OR REPLACE TABLE dim_user_star AS
SELECT user_id, user_name, level FROM read_parquet('data/small/users.parquet');

CREATE OR REPLACE TABLE dim_product_star AS
SELECT
  product_id, product_name, category, sub_category, price
FROM read_parquet('data/small/products.parquet');

CREATE OR REPLACE TABLE dim_date_star AS
SELECT
  CAST(strftime(d, '%Y%m%d') AS INT) AS date_key,
  d                                 AS date_value,
  EXTRACT('year'   FROM d)         AS year,
  EXTRACT('month'  FROM d)         AS month,
  EXTRACT('quarter' FROM d)        AS quarter,
  EXTRACT('dow'    FROM d)         AS day_of_week
FROM (SELECT DISTINCT CAST(order_date AS DATE) AS d
      FROM read_parquet('data/small/orders.parquet')) t;

CREATE OR REPLACE TABLE fact_orders_star AS
SELECT
  o.order_id,
  o.user_id,
  i.product_id,
  CAST(strftime(o.order_date, '%Y%m%d') AS INT) AS date_key,
  o.total,
  o.status
FROM read_parquet('data/small/orders.parquet') o
JOIN read_parquet('data/small/order_items.parquet') i
  ON o.order_id = i.order_id;

-- Star schema query: 3 joins max
SELECT
  d.year, d.month, p.category,
  COUNT(*)        AS orders,
  SUM(f.total)    AS gmv
FROM fact_orders_star f
JOIN dim_user_star  u ON f.user_id    = u.user_id
JOIN dim_product_star p ON f.product_id = p.product_id
JOIN dim_date_star  d ON f.date_key   = d.date_key
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
LIMIT 5;

-- ============================================================
-- (2) Snowflake schema: split dim_product into category
--     In a snowflake, dim_product only carries the FK to dim_category
--     (no sub_category text repeated), and we hop to dim_category
--     for the human-readable name.
-- ============================================================
CREATE OR REPLACE TABLE dim_category_snow AS
SELECT DISTINCT category, sub_category
FROM read_parquet('data/small/products.parquet');

CREATE OR REPLACE TABLE dim_product_snow AS
SELECT product_id, product_name, price, category, sub_category
FROM read_parquet('data/small/products.parquet');

-- Snowflake: now dim_product is *normalised*; sub_category is the
-- natural key into dim_category (not stored on dim_product).
-- For a true snowflake you would do this:
--
--   CREATE OR REPLACE TABLE dim_product_snow AS
--   SELECT product_id, product_name, price, category  -- FK only
--   FROM read_parquet('data/small/products.parquet');
--
-- Then the join would be:
--
--   JOIN dim_product_snow p ON ...
--   JOIN dim_category_snow c
--     ON p.category = c.category;
--
--   SELECT d.year, c.sub_category, ...
--
-- We keep sub_category on dim_product only to compare
-- "star vs snowflake" join counts; the point is the extra hop.

-- Snowflake query: 3 joins (same number, but extra hop to dim_category)
SELECT
  d.year, c.category, c.sub_category,
  COUNT(*)        AS orders,
  SUM(f.total)    AS gmv
FROM fact_orders_star f
JOIN dim_product_snow p ON f.product_id = p.product_id
JOIN dim_category_snow c ON p.category = c.category
                        AND p.sub_category = c.sub_category
JOIN dim_date_star    d ON f.date_key = d.date_key
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
LIMIT 5;

-- Both queries return the same numbers; the snowflake has 1 extra
-- join per row when dim_product is fully normalised.  The star
-- schema wins on every warehouse engine.
