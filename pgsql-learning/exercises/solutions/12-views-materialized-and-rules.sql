-- Solutions 12
SET search_path = sql_core, public;
DROP VIEW IF EXISTS v_paid_orders CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_daily CASCADE;
DROP RULE IF EXISTS ord_audit_rl ON sql_core.orders CASCADE;

CREATE VIEW v_paid_orders AS
  SELECT * FROM sql_core.orders WHERE status = 'paid'
  WITH CHECK OPTION;

CREATE MATERIALIZED VIEW mv_daily AS
  SELECT date_trunc('day', placed_at)::date AS day, count(*) AS n
    FROM sql_core.orders
   GROUP BY day;

CREATE UNIQUE INDEX mv_daily_day_idx ON mv_daily (day);

REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily;
