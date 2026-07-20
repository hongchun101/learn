-- Solutions 25
SET search_path = sql_core, public;
DROP TABLE IF EXISTS t25 CASCADE;
CREATE TABLE t25 AS SELECT g AS id, (random()*100)::int AS n FROM generate_series(1,500000) g;
ANALYZE t25;

-- Slow query, no index
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM t25 WHERE n = 1;
-- Add an index
CREATE INDEX t25_n ON t25 (n);
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM t25 WHERE n = 1;
