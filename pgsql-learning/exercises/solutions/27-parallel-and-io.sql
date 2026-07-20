-- Solutions 27
SET search_path = sql_core, public;
DROP TABLE IF EXISTS big CASCADE;
CREATE TABLE big AS SELECT g AS id, (random()*100)::int AS n FROM generate_series(1, 2000000) g;
ANALYZE big;

SET LOCAL parallel_tuple_cost = 0.01;
EXPLAIN SELECT count(*) FROM big WHERE n < 5;

CREATE EXTENSION IF NOT EXISTS pg_prewarm;
SELECT count(*) FROM pg_prewarm('big');
