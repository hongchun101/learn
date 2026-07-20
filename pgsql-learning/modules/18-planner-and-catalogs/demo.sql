-- Module 18 — Planner and System Catalogs
\echo === Module 18: Planner and System Catalogs ===
SET search_path = sql_core, public;

\echo === 18.1 Catalog map: tables, indexes, columns ===

SELECT relname, relkind,
       pg_size_pretty(pg_relation_size(oid)) AS heap,
       pg_size_pretty(pg_total_relation_size(oid)) AS total
  FROM pg_class
 WHERE relnamespace = 'sql_core'::regnamespace
 ORDER BY total DESC NULLS LAST;

\echo === 18.2 pg_stats sample ===
SELECT schemaname, tablename, attname, n_distinct,
       (most_common_vals IS NOT NULL) AS has_mcv,
       array_length(most_common_vals, 1) AS mcv_size
  FROM pg_stats
 WHERE schemaname = 'sql_core'
 LIMIT 10;

\echo === 18.3 GUCs that drive cost estimates ===
SHOW random_page_cost;
SHOW seq_page_cost;
SHOW cpu_tuple_cost;
SHOW cpu_operator_cost;
SHOW effective_cache_size;

\echo === 18.4 Override cost via SET LOCAL and re-EXPLAIN ===
DROP TABLE IF EXISTS p_18 CASCADE;
CREATE TABLE p_18 AS SELECT g AS id, (random()*100)::int AS n FROM generate_series(1, 10000) g;
ANALYZE p_18;

EXPLAIN SELECT * FROM p_18 WHERE n < 5;

\echo === 18.5 Hint via optimizer cost: turn off seq_page_cost ratio ===
SET LOCAL random_page_cost = 0.1;
EXPLAIN SELECT * FROM p_18 WHERE n < 5;
RESET random_page_cost;

\echo === 18.6 Cross-column stats (extended stats) ===
DROP TABLE IF EXISTS ext_stats CASCADE;
CREATE TABLE ext_stats (a int, b int);
INSERT INTO ext_stats
SELECT (random()*3)::int, (random()*3)::int FROM generate_series(1, 10000);

CREATE STATISTICS ext_stats_corr (dependencies, ndistinct) ON a, b FROM ext_stats;
ANALYZE ext_stats;

SELECT * FROM pg_statistic_ext WHERE stxrelid = 'ext_stats'::regclass;

\echo === Module 18 complete ===
