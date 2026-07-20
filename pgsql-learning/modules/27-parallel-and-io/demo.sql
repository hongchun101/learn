-- Module 27 — Parallel and I/O
\echo === Module 27: Parallel and I/O ===
SET search_path = sql_core, public;

\echo === 27.1 GUCs that enable parallel execution ===
SHOW max_parallel_workers;
SHOW max_parallel_workers_per_gather;
SHOW max_parallel_maintenance_workers;
SHOW parallel_tuple_cost;
SHOW parallel_setup_cost;
SHOW min_parallel_table_scan_size;
SHOW min_parallel_index_scan_size;
SHOW effective_io_concurrency;

\echo === 27.2 Force (or forbid) parallelism in a query ===
DROP TABLE IF EXISTS big_table;
CREATE TABLE big_table AS SELECT gs AS id, (random()*1000)::int AS n FROM generate_series(1, 5000000) gs;
ANALYZE big_table;

EXPLAIN SELECT count(*) FROM big_table WHERE n < 50;

\echo --- belt + suspenders: provide parallel_workers hint via cost
SET LOCAL parallel_tuple_cost = 0.01;
SET LOCAL min_parallel_table_scan_size = '8MB';
EXPLAIN SELECT count(*) FROM big_table WHERE n < 50;

\echo === 27.3 Parallel index build ===
SET max_parallel_maintenance_workers = 2;
CREATE INDEX big_table_n_idx ON big_table (n);
RESET max_parallel_maintenance_workers;

\echo === 27.4 pg_prewarm to avoid cold-cache cliff ===
CREATE EXTENSION IF NOT EXISTS pg_prewarm;
SELECT count(*) FROM pg_prewarm('big_table', 'buffer', 'main');
\echo --- bg writer / checkpoint / pg_prewarm all mitigate cold-cache pain.

\echo === 27.5 IO contention knobs (PG16 subset) ===
SHOW effective_io_concurrency;
SHOW maintenance_io_concurrency;
SHOW wal_compression;

\echo === 27.6 Watch activity for parallelism ===
SELECT pid, application_name, state, wait_event_type, wait_event
  FROM pg_stat_activity
 WHERE backend_type = 'client backend' AND state IS NOT NULL
 ORDER BY pid;

\echo === Module 27 complete ===
