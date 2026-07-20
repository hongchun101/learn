-- Solutions 10
SET search_path = sql_core, public;
DROP TABLE IF EXISTS t10 CASCADE;
CREATE TABLE t10 AS SELECT g AS id, (random()*1000)::int AS n FROM generate_series(1, 100000) g;
ANALYZE t10;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM t10 WHERE n < 5;
-- Inspect Execution Time, Buffers:shared, and Hash Cond.
-- Estimated vs actual rows for the Seq Scan node.
