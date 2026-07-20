-- Capstone — Operational queries an expert can fire off in their sleep.

-- Replication state
SELECT client_addr, state, sync_state,
       sent_lsn, replay_lsn,
       (sent_lsn - replay_lsn)         AS bytes_behind
  FROM pg_stat_replication;

-- Vacuum health
SELECT c.relname, t.n_live_tup, t.n_dead_tup,
       pg_size_pretty(pg_total_relation_size(t.relid)) AS size
  FROM pg_stat_user_tables t
  JOIN pg_class c ON c.oid = t.relid
 WHERE t.n_dead_tup > 0
 ORDER BY t.n_dead_tup DESC
 LIMIT 10;

-- Slow queries (pg_stat_statements)
SELECT substring(query for 80) AS query_prefix,
       calls,
       round(mean_exec_time::numeric, 1) AS mean_ms
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 10;

-- Active activity
SELECT pid, state, now() - query_start AS dur, left(query, 80) AS q
  FROM pg_stat_activity
 WHERE backend_type = 'client backend' AND state IS NOT NULL
 ORDER BY query_start;

-- Lock storm?
SELECT mode, granted, count(*)
  FROM pg_locks
 GROUP BY mode, granted
 ORDER BY count(*) DESC;

-- Index bloat candidates (top 10 unused)
SELECT s.schemaname, s.relname, s.indexrelname, s.idx_scan
  FROM pg_stat_user_indexes s
 WHERE s.idx_scan = 0
 ORDER BY s.relname;

-- Wraparound horizon
SELECT datname, age(datfrozenxid), datfrozenxid
  FROM pg_database
 WHERE datistemplate = false;

-- Slot health
SELECT slot_name, active, restart_lsn
  FROM pg_replication_slots;
