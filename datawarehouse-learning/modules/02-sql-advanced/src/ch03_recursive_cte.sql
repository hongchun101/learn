-- Module 02 / ch03 — recursive CTEs
-- Run with: duckdb < modules/02-sql-advanced/src/ch03_recursive_cte.sql

CREATE SCHEMA IF NOT EXISTS demo;

-- (1) Date series — fill gaps
CREATE OR REPLACE TABLE demo.daily_orders AS
SELECT
  CAST(order_date AS DATE) AS dt,
  SUM(total) AS gmv
FROM read_parquet('data/small/orders.parquet')
GROUP BY 1;

WITH RECURSIVE dates AS (
  SELECT MIN(dt) AS dt FROM demo.daily_orders
  UNION ALL
  SELECT dt + INTERVAL 1 DAY FROM dates
  WHERE dt < (SELECT MAX(dt) FROM demo.daily_orders)
)
SELECT
  d.dt,
  COALESCE(o.gmv, 0) AS gmv
FROM dates d
LEFT JOIN demo.daily_orders o ON d.dt = o.dt
ORDER BY d.dt
LIMIT 10;
WITH RECURSIVE fib(a, b) AS (
  SELECT 0, 1
  UNION ALL
  SELECT b, a + b FROM fib WHERE a <= 100
)
SELECT a FROM fib;
WITH RECURSIVE nums AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM nums WHERE n < 10
)
SELECT * FROM nums;

-- (3) Fibonacci
WITH RECURSIVE fib(a, b) AS (
  SELECT 0, 1
  UNION ALL
  SELECT b, a + b FROM fib WHERE a < 100
)
SELECT a FROM fib;

-- (4) Org chart (synthetic)
CREATE OR REPLACE TABLE demo.org AS
SELECT * FROM (VALUES
  (1,  'CEO',     NULL),
  (2,  'CTO',     1),
  (3,  'CFO',     1),
  (4,  'VP_Eng',  2),
  (5,  'VP_Data', 2),
  (6,  'Dir_BE',  4),
  (7,  'Dir_FE',  4),
  (8,  'Eng_BE',  6),
  (9,  'Eng_FE',  7)
) AS t(id, name, manager_id);

WITH RECURSIVE tree AS (
  SELECT id, name, manager_id, 0 AS depth,
         name::VARCHAR AS path
  FROM demo.org
  WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, e.manager_id, t.depth + 1,
         t.path || ' > ' || e.name
  FROM demo.org e
  JOIN tree t ON e.manager_id = t.id
)
SELECT * FROM tree ORDER BY depth, name;

-- (5) BOM explosion
CREATE OR REPLACE TABLE demo.bom AS
SELECT * FROM (VALUES
  ('X',  'A',  2),
  ('X',  'B',  1),
  ('A',  'A1', 3),
  ('A',  'A2', 2),
  ('B',  'B1', 4),
  ('A1', 'A1a',5),
  ('A1', 'A1b',2)
) AS t(parent_part, part, qty);

WITH RECURSIVE explosion AS (
  SELECT part, parent_part, qty, 1 AS level
  FROM demo.bom WHERE parent_part = 'X'
  UNION ALL
  SELECT b.part, b.parent_part, b.qty * e.qty, e.level + 1
  FROM demo.bom b
  JOIN explosion e ON b.parent_part = e.part
)
SELECT level, part, SUM(qty) AS total_qty
FROM explosion GROUP BY 1, 2 ORDER BY 1, 2;
