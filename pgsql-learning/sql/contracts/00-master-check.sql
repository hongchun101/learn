-- Contract #1: EXPLAIN (ANALYZE, BUFFERS) returns a plan tree we can read.
-- Re-checked in modules 11, 18, 25, 26, 27.
\echo === Contract 1: EXPLAIN ===
BEGIN;
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT 1 FROM pg_class WHERE relname = 'pg_class' LIMIT 1;
ROLLBACK;

-- Contract #2: pg_stat_activity is readable from any client.
\echo === Contract 2: pg_stat_activity ===
SELECT count(*) AS active_query_count FROM pg_stat_activity WHERE state IS NOT NULL;

-- Contract #3: pg_class is the canonical relation catalog.
\echo === Contract 3: pg_class ===
SELECT relkind, count(*)
  FROM pg_class
 GROUP BY relkind
 ORDER BY relkind;

-- Contract #4: LSN functions return current and replay positions.
\echo === Contract 4: WAL LSNs ===
SELECT pg_current_wal_lsn() AS current_lsn,
       pg_last_wal_replay_lsn() AS last_replay;

-- Contract #5: pg_stat_statements installed? (Optional; modules check idempotently.)
\echo === Contract 5: pg_stat_statements ===
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_stat_statements';
