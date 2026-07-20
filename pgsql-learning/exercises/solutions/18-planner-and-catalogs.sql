-- Solutions 18
SET search_path = sql_core, public;

-- Q1
SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS total
  FROM pg_class
 WHERE relkind = 'r' AND relnamespace = 'sql_core'::regnamespace
 ORDER BY pg_total_relation_size(oid) DESC
 LIMIT 10;

-- Q2
SELECT * FROM pg_stats WHERE tablename = 't_text_demo';

-- Q3
DROP TABLE IF EXISTS t18 CASCADE;
CREATE TABLE t18 (a int, b int);
INSERT INTO t18 SELECT (random()*3)::int, (random()*3)::int FROM generate_series(1, 5000);
CREATE STATISTICS s18 (dependencies) ON a, b FROM t18;
ANALYZE t18;
EXPLAIN SELECT * FROM t18 WHERE a = 1 AND b = 1;
