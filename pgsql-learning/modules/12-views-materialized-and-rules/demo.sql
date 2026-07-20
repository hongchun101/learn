-- Module 12 — Views, Materialized Views, Rules
\echo === Module 12: Views and Materialized Views ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS orders CASCADE;
DROP VIEW  IF EXISTS v_orders_by_status CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_daily_orders CASCADE;
DROP VIEW  IF EXISTS v_recent_paid_orders CASCADE;

CREATE TABLE orders (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  bigint NOT NULL,
    status       text   NOT NULL,
    total        numeric(12,2) NOT NULL,
    placed_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO orders (customer_id, status, total, placed_at) VALUES
 (1,'paid',    10.00, current_date),
 (1,'paid',    20.00, current_date - 1),
 (2,'pending',100.00,current_date),
 (3,'paid',    50.00, current_date - 3);

-- 12.1 Plain view (rewritten in place; planner can push predicates)
CREATE VIEW v_orders_by_status AS
  SELECT status, count(*) AS n, sum(total) AS total
    FROM orders
   GROUP BY status;

SELECT * FROM v_orders_by_status WHERE status = 'paid';

-- 12.2 Updatable view (single-table, no aggregates, has all defaults)
CREATE VIEW v_recent_paid_orders AS
  SELECT id, customer_id, total, placed_at
    FROM orders
   WHERE status = 'paid' AND placed_at >= current_date - interval '7 days';

-- 12.3 Materialized view: stored, refreshed explicitly
CREATE MATERIALIZED VIEW mv_daily_orders AS
  SELECT date_trunc('day', placed_at)::date AS day, count(*) AS n, sum(total) AS total
    FROM orders
   GROUP BY day;

SELECT * FROM mv_daily_orders;

REFRESH MATERIALIZED VIEW mv_daily_orders;
-- REFRESH MATERIALIZED VIEW takes an ACCESS EXCLUSIVE lock.

CREATE UNIQUE INDEX mv_daily_orders_day_idx ON mv_daily_orders (day);
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_orders;
-- CONCURRENTLY requires a UNIQUE index on the materialized view.

-- 12.4 Rules — pre-planner rewrites (we only show them; if you're tempted to
-- use them, you almost certainly want a trigger or a generated column).
DROP TABLE IF EXISTS t CASCADE;
DROP TABLE IF EXISTS t_audit CASCADE;
CREATE TABLE t (n int);
CREATE TABLE t_audit (op text, at timestamptz, n int);
CREATE RULE t_log AS ON INSERT TO t DO ALSO
  INSERT INTO t_audit(op, at, n) VALUES ('insert', now(), NEW.n);
INSERT INTO t VALUES (1), (2);
SELECT * FROM t_audit;

-- 12.5 WITH CHECK OPTION — view cannot be updated outside its predicate
CREATE VIEW v_paid AS
  SELECT * FROM orders WHERE status = 'paid'
   WITH CHECK OPTION;
-- INSERT INTO v_paid (status) VALUES ('cancelled'); -- will fail
SELECT 'WITH CHECK OPTION in effect' AS info;

\echo === Module 12 complete ===
