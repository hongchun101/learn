-- Module 17 — Tuning demo (DuckDB reference engine).
--
-- Idea: build several physical layouts of the same `ods.orders` / `ods.order_items`
-- fact table, then EXPLAIN ANALYZE representative queries so the optimizer's
-- row-group pruning, join strategy, and sort order show up in the plan.
--
-- Layouts:
--   dwt.orders_unsorted   — row-major, no ordering (baseline)
--   dwt.orders_by_date    — clustered on order_date (partition column analogue)
--   dwt.orders_by_user    — clustered on user_id       (bucket / sort-key analogue)
--   dwt.orders_compound   — clustered on (order_date, user_id) (compound)
--
-- DuckDB does not expose Hive-style partition dirs, but its Parquet writer
-- emits row-group level min/max statistics. Sorting rows before CREATE TABLE
-- AS SELECT gives the optimizer real min/max per row group and the EXPLAIN
-- output literally shows fewer rows scanned.

-- ────────────────────────────────────────────────────────────────────
-- 0. Schemas
-- ────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS dwt;

-- ────────────────────────────────────────────────────────────────────
-- 1. Baseline — unsorted copy (no clustering, full scan cost)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TABLE dwt.orders_unsorted AS
SELECT * FROM ods.orders;
SELECT COUNT(*) AS unsorted_rows FROM dwt.orders_unsorted;

-- ────────────────────────────────────────────────────────────────────
-- 2. Date-clustered layout (partition-pruning analogue)
--    Sort by order_date so each row group spans a narrow date range.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TABLE dwt.orders_by_date AS
SELECT * FROM ods.orders ORDER BY order_date, order_id;
SELECT COUNT(*) AS by_date_rows FROM dwt.orders_by_date;

-- ────────────────────────────────────────────────────────────────────
-- 3. User-bucketed layout — sort by user_id so per-user ranges are local.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TABLE dwt.orders_by_user AS
SELECT * FROM ods.orders ORDER BY user_id, order_id;
SELECT COUNT(*) AS by_user_rows FROM dwt.orders_by_user;

-- ────────────────────────────────────────────────────────────────────
-- 4. Compound (date, user) — both pruning and bucketing benefits.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TABLE dwt.orders_compound AS
SELECT * FROM ods.orders ORDER BY order_date, user_id, order_id;
SELECT COUNT(*) AS compound_rows FROM dwt.orders_compound;

-- ────────────────────────────────────────────────────────────────────
-- 5. event layout clustered on event_ts (range scans on user_events)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TABLE dwt.events_by_ts AS
SELECT * FROM ods.user_events ORDER BY event_ts;
SELECT COUNT(*) AS events_rows FROM dwt.events_by_ts;

-- ────────────────────────────────────────────────────────────────────
-- 6. EXPLAIN ANALYZE — date range filter on UNSORTED vs DATE-CLUSTERED.
--    The plan reports RowsScanned: full scan on unsorted, partial on by_date.
-- ────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT COUNT(*), SUM(total)
FROM dwt.orders_unsorted
WHERE order_date BETWEEN DATE '2024-03-01' AND DATE '2024-03-31';

EXPLAIN ANALYZE
SELECT COUNT(*), SUM(total)
FROM dwt.orders_by_date
WHERE order_date BETWEEN DATE '2024-03-01' AND DATE '2024-03-31';

EXPLAIN ANALYZE
SELECT COUNT(*), SUM(total)
FROM dwt.orders_compound
WHERE order_date BETWEEN DATE '2024-03-01' AND DATE '2024-03-31';

-- ────────────────────────────────────────────────────────────────────
-- 7. EXPLAIN ANALYZE — single-user filter on UNSORTED vs USER-CLUSTERED.
--    user-clustered layout keeps one user's rows in adjacent row groups.
-- ────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT COUNT(*), SUM(total)
FROM dwt.orders_unsorted
WHERE user_id = 42;

EXPLAIN ANALYZE
SELECT COUNT(*), SUM(total)
FROM dwt.orders_by_user
WHERE user_id = 42;

-- ────────────────────────────────────────────────────────────────────
-- 8. Join strategy — HASH JOIN vs NESTED LOOP.
--    Build a tiny dimension (10 rows) — optimizer should pick nested loop.
--    Then force a larger build side and watch it flip to hash join.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TABLE dwt.dim_user_small AS
SELECT * FROM ods.users WHERE user_id <= 10;

CREATE OR REPLACE TABLE dwt.dim_user_big AS
SELECT * FROM ods.users;

EXPLAIN ANALYZE
SELECT o.order_id, u.user_name, o.total
FROM dwt.orders_by_date o
JOIN dwt.dim_user_small u ON o.user_id = u.user_id
WHERE o.order_date BETWEEN DATE '2024-03-01' AND DATE '2024-03-31';

EXPLAIN ANALYZE
SELECT o.order_id, u.user_name, o.total
FROM dwt.orders_by_date o
JOIN dwt.dim_user_big u ON o.user_id = u.user_id
WHERE o.order_date BETWEEN DATE '2024-03-01' AND DATE '2024-03-31';

-- ────────────────────────────────────────────────────────────────────
-- 9. Data skew — flat distribution vs hot key.
--    Create a 1000x-skewed copy where user_id=1 owns 90% of rows.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TABLE dwt.orders_skewed AS
WITH numbered AS (
    SELECT *, row_number() OVER () AS rn FROM dwt.orders_unsorted
)
SELECT
    CASE WHEN rn % 10 != 0 THEN 1 ELSE 2 + (rn % 50) END AS user_id,
    order_id,
    total,
    status,
    order_date,
    order_ts
FROM numbered;

EXPLAIN ANALYZE
SELECT user_id, COUNT(*) AS c, SUM(total) AS s
FROM dwt.orders_skewed
GROUP BY user_id
ORDER BY c DESC
LIMIT 5;

-- ────────────────────────────────────────────────────────────────────
-- 10. Broadcast hint — DuckDB syntax: use a CROSS JOIN with literal build.
--     Demonstrates the planner's choice (here it picks a hash build).
-- ────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT o.order_id, p.product_name
FROM dwt.orders_compound o
JOIN ods.order_items i ON o.order_id = i.order_id
JOIN ods.products     p ON i.product_id = p.product_id
WHERE o.order_date BETWEEN DATE '2024-03-01' AND DATE '2024-03-31'
LIMIT 1000;

-- ────────────────────────────────────────────────────────────────────
-- 11. Final summary view — what the optimizer sees for each layout.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW dwt.v_tuning_summary AS
SELECT
    'orders_unsorted' AS layout, COUNT(*) AS rows FROM dwt.orders_unsorted
UNION ALL
SELECT 'orders_by_date',  COUNT(*) FROM dwt.orders_by_date
UNION ALL
SELECT 'orders_by_user',  COUNT(*) FROM dwt.orders_by_user
UNION ALL
SELECT 'orders_compound', COUNT(*) FROM dwt.orders_compound
UNION ALL
SELECT 'orders_skewed',   COUNT(*) FROM dwt.orders_skewed
UNION ALL
SELECT 'events_by_ts',    COUNT(*) FROM dwt.events_by_ts;
SELECT * FROM dwt.v_tuning_summary ORDER BY layout;