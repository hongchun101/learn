-- Capstone — Operational deep-dive (Module 22 + 25 + 26 + 27).
SET search_path = shop, public, perf;

\echo === 8.1 Top 10 queries by total execution time ===
SELECT substring(query for 100) AS query,
       calls,
       round(mean_exec_time::numeric, 1) AS mean_ms,
       round(total_exec_time::numeric, 1) AS total_ms,
       rows
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 10;

\echo === 8.2 Per-table bloat candidates ===
SELECT c.relname,
       pg_size_pretty(pg_total_relation_size(t.relid))      AS total_size,
       t.n_live_tup                                          AS live,
       t.n_dead_tup                                          AS dead,
       round(100.0 * t.n_dead_tup / nullif(t.n_live_tup, 0), 1) AS dead_pct,
       t.last_autovacuum,
       t.last_autoanalyze
  FROM pg_stat_user_tables t
  JOIN pg_class c ON c.oid = t.relid
 WHERE t.n_dead_tup > 0
 ORDER BY t.n_dead_tup DESC
 LIMIT 10;

\echo === 8.3 Index usage — candidates for DROP INDEX ===
SELECT s.schemaname, s.relname, s.indexrelname,
       s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size
  FROM pg_stat_user_indexes s
 WHERE s.idx_scan = 0
 ORDER BY pg_relation_size(s.indexrelid) DESC
 LIMIT 10;

\echo === 8.4 Replication lag ===
SELECT client_addr, state, sync_state,
       sent_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS bytes_behind,
       now() - pg_last_xact_replay_timestamp() AS replay_age
  FROM pg_stat_replication;

\echo === 8.5 Wraparound horizon ===
SELECT datname, age(datfrozenxid) AS xid_age
  FROM pg_database WHERE datistemplate = false
 ORDER BY age(datfrozenxid) DESC;

\echo === 8.6 Active backends (Module 22) ===
SELECT pid, application_name, state,
       (now() - query_start) AS query_age,
       (now() - xact_start)  AS xact_age,
       wait_event_type, wait_event,
       left(query, 80) AS q
  FROM pg_stat_activity
 WHERE backend_type = 'client backend'
 ORDER BY query_start NULLS LAST
 LIMIT 20;

\echo === 8.7 Lock contention ===
SELECT mode, granted, count(*) AS n
  FROM pg_locks
 GROUP BY 1, 2
 ORDER BY 3 DESC
 LIMIT 15;

\echo === 8.8 Replication slots ===
SELECT slot_name, plugin, slot_type, active,
       restart_lsn,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS bytes_pending
  FROM pg_replication_slots;

\echo === 8.9 Cost-model snapshot (Module 25) ===
SELECT name, setting, unit
  FROM pg_settings
 WHERE name IN ('random_page_cost', 'seq_page_cost',
                'effective_cache_size', 'work_mem',
                'max_parallel_workers_per_gather',
                'default_statistics_target')
 ORDER BY name;

\echo === 8.10 Buffer cache hit ratio ===
SELECT round(
    100.0 * sum(heap_blks_hit)::numeric
        / nullif(sum(heap_blks_hit + heap_blks_read), 0),
  2) AS heap_cache_hit_pct
  FROM pg_statio_user_tables;

\echo === 8.11 EXPLAIN baseline for the hottest query in 8.1 ===
-- (This is illustrative; run it for the actual hottest query.)
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, count(*) AS n
  FROM shop.orders
 WHERE placed_at >= current_date - interval '7 days'
 GROUP BY user_id
 ORDER BY n DESC
 LIMIT 5;
