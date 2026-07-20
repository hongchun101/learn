-- Module 05 — CTEs and Recursive
\echo === Module 05: CTEs and Recursive ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS sales CASCADE;

CREATE TABLE employees (
    id          bigint PRIMARY KEY,
    name        text NOT NULL,
    manager_id  bigint REFERENCES employees(id)
);

INSERT INTO employees VALUES
 (1, 'CEO',    NULL),
 (2, 'VP-Eng', 1),
 (3, 'VP-Sales', 1),
 (4, 'Eng-1', 2),
 (5, 'Eng-2', 2),
 (6, 'Eng-3', 2),
 (7, 'Sales-1', 3),
 (8, 'Sales-2', 3);

CREATE TABLE sales (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seller_id    bigint NOT NULL REFERENCES employees(id),
    sold_on      date   NOT NULL,
    product_sku  text   NOT NULL,
    amount       numeric(12,2) NOT NULL,
    region       text   NOT NULL
);
INSERT INTO sales (seller_id, sold_on, product_sku, amount, region) VALUES
 (7, date '2025-06-01', 'SKU-A', 100.00, 'EU'),
 (7, date '2025-06-02', 'SKU-B', 200.00, 'EU'),
 (8, date '2025-06-01', 'SKU-A', 150.00, 'US'),
 (8, date '2025-06-03', 'SKU-A',  90.00, 'EU'),
 (4, date '2025-06-04', 'SKU-C', 500.00, 'US');

-- 5.1 Non-recursive CTE: top-2 products per seller this month
WITH seller_totals AS (
    SELECT seller_id, sum(amount) AS total
      FROM sales
     WHERE sold_on >= date_trunc('month', now())
     GROUP BY seller_id
)
SELECT e.name, st.total
  FROM seller_totals st
  JOIN employees e ON e.id = st.seller_id
 ORDER BY st.total DESC
 LIMIT 2;

-- 5.2 Multiple CTEs; one writes, one reads (data-modifying CTE).
WITH inserted AS (
    INSERT INTO sales (seller_id, sold_on, product_sku, amount, region)
    VALUES (4, current_date, 'SKU-D', 99.00, 'EU')
    RETURNING *
)
SELECT inserted.id, e.name FROM inserted JOIN employees e ON e.id = inserted.seller_id;
-- Note: a CTE that performs a writing statement cannot be used multiple
-- times in the same query — we'll see why below.

-- 5.3 Multiple references to a CTE: NOT re-evaluated. Build the CTE once.
-- The same applies to writing CTEs: by default a writable CTE returns its
-- result set exactly once. To compute it twice you'd need a view or a temp
-- table.

-- 5.4 Recursive CTE: walk the manager hierarchy.
WITH RECURSIVE org AS (
    SELECT id, name, manager_id, 1 AS depth
      FROM employees
     WHERE manager_id IS NULL                          -- base case
    UNION ALL
    SELECT e.id, e.name, e.manager_id, o.depth + 1
      FROM employees e
      JOIN org o ON e.manager_id = o.id                -- recursive case
)
SELECT repeat('  ', depth - 1) || name AS chain, depth FROM org ORDER BY depth, name;

-- 5.5 Cycle detection: someone in the chain reports back to themselves
-- (shouldn't happen; let's see).
INSERT INTO employees (id, name, manager_id) VALUES (99, 'Cycle', 99);

WITH RECURSIVE org AS (
    SELECT id, name, manager_id, ARRAY[id] AS path, false AS cycle
      FROM employees WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.name, e.manager_id, o.path || e.id, e.id = ANY(o.path)
      FROM employees e
      JOIN org o ON e.manager_id = o.id
     WHERE NOT o.cycle
)
SELECT * FROM org WHERE cycle;
-- CYCLE columns prevent walking into loops; we show the pattern explicitly.

-- 5.6 Recursive CTE computing a running sum
WITH RECURSIVE running AS (
    SELECT sold_on::text AS day, sum(amount) AS day_total, sum(sum(amount)) OVER (ORDER BY sold_on) AS running_total
      FROM sales
     GROUP BY sold_on
)
SELECT day, day_total, running_total FROM running ORDER BY day;
-- Run-recursive-CTE + window over totals is a common pattern.

\echo === Module 05 complete ===
