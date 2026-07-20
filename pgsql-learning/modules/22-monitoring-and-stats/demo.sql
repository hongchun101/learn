-- Module 22 — Monitoring and pg_stat
\echo === Module 22: Monitoring and Stats ===
SET search_path = sql_core, public;

\echo === 22.1 Activity view ===
SELECT pid, application_name, state,
       (now() - backend_start)               AS session_age,
       (now() - xact_start)                  AS xact_age,
       (now() - query_start)                 AS query_age,
       left(query, 60)                       AS query_prefix
  FROM pg_stat_activity
 WHERE backend_type = 'client backend'
 ORDER BY state DESC;

\echo === 22.2 Lock view ===
SELECT relation::regclass, mode, granted, locktype, pid
  FROM pg_locks
 ORDER BY relation::regclass::text, mode;

\echo === 22.3 pg_stat_statements (requires shared_preload_libraries) ===
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
\echo --- (must be in shared_preload_libraries; restart post-restart if needed)

SELECT substring(query for 80) AS query_prefix,
       calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(total_exec_time::numeric, 2) AS total_ms
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 10;

\echo === 22.4 Per-table I/O counters ===
SELECT c.relname,
       seq_scan,
       seq_tup_read,
       idx_scan,
       idx_tup_fetch,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
       heap_blks_read,
       heap_blks_hit,
       toast_blks_read,
       toast_blks_hit
  FROM pg_class c
  JOIN pg_stat_user_tables  t1 ON t1.relid = c.oid
  JOIN pg_statio_user_tables t2 ON t2.relid = c.oid
 WHERE c.relnamespace = 'sql_core'::regnamespace
 ORDER BY c.relname;

\echo === 22.5 Progress: vacuum / cluster / replay ===
SELECT pid, datname, relid::regclass, phase,
       heap_blks_total, heap_blks_scanned,
       heap_blks_vacuumed, num_dead_tuples
  FROM pg_stat_progress_vacuum;

\echo === 22.6 snapshot script (manual: take rows from key views once per minute) ===
\echo --- see scripts/snapshot-stats.sh

\echo === Module 22 complete ===
