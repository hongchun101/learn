-- Solutions 28 — Scaling and Sharding
SET search_path = sql_core, public;

-- Q1 — set up replica FDW and a foreign table over pg_stat_activity
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

DROP SERVER IF EXISTS replica_for_app CASCADE;
CREATE SERVER replica_for_app
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'replica', port '5432', dbname 'learning');

CREATE USER MAPPING IF NOT EXISTS FOR postgres
  SERVER replica_for_app
  OPTIONS (user 'postgres', password 'postgres');

DROP FOREIGN TABLE IF EXISTS replica_activity;
CREATE FOREIGN TABLE replica_activity (
    datname          name,
    pid              integer,
    application_name text,
    state            text,
    query            text
) SERVER replica_for_app
  OPTIONS (schema_name 'pg_catalog', table_name 'pg_stat_activity');

SELECT count(*) AS replica_backend_count
  FROM replica_activity
 WHERE backend_type = 'client backend';

-- Q2 — partition a 1000-row events table by day; verify pruning
DROP TABLE IF EXISTS ex28_events;
CREATE TABLE ex28_events (
    id       bigint GENERATED ALWAYS AS IDENTITY,
    day      date NOT NULL,
    payload  text,
    PRIMARY KEY (day, id)
) PARTITION BY RANGE (day);

DO $$
DECLARE i int; d date;
BEGIN
    FOR i IN 0..6 LOOP
        d := CURRENT_DATE + i;
        EXECUTE format(
          'CREATE TABLE ex28_events_p%s PARTITION OF ex28_events
             FOR VALUES FROM (%L) TO (%L)',
          to_char(d,'YYYYMMDD'), d, (d + 1));
    END LOOP;
END $$;

INSERT INTO ex28_events (day, payload)
SELECT CURRENT_DATE + (g % 7), 'p-' || g
  FROM generate_series(1, 1000) g;

ANALYZE ex28_events;

-- Pruning: the EXPLAIN should touch exactly one partition
EXPLAIN SELECT count(*) FROM ex28_events WHERE day = CURRENT_DATE;

-- Q3 — replication state
SELECT client_addr, state, sync_state,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS bytes_behind
  FROM pg_stat_replication;

-- Q4 — top queries by total time
SELECT substring(query for 80) AS query,
       calls,
       round(mean_exec_time::numeric, 1) AS mean_ms
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 5;

-- Q5 — when NOT to shard (text answer):
-- - OLTP, sub-100ms queries, write-heavy on a single tenant.
--   Sharding adds network round trips on every cross-shard query;
--   a sub-100ms OLTP query becomes 50ms × N shards quickly.
-- - When joins across shards become unworkable. SQL doesn't have
--   a good story for distributed joins; you either denormalize or
--   move joins to the application layer.
-- - When a single physical box with 32 cores / 256 GB / 16 TB NVMe
--   solves the problem at 1/10 the engineering cost.
-- - When you have not measured first. The most common reason for
--   "we need to shard" is "we have not indexed / vacuumed /
--   pooled correctly".

-- Q6 — read ratio from pg_statio_user_indexes
SELECT round(
    100.0 * sum(idx_blks_hit)::numeric
        / nullif(sum(idx_blks_hit + idx_blks_read), 0),
  2) AS idx_cache_hit_pct
  FROM pg_statio_user_indexes;

-- Repeat for tables:
SELECT round(
    100.0 * sum(heap_blks_hit)::numeric
        / nullif(sum(heap_blks_hit + heap_blks_read), 0),
  2) AS heap_cache_hit_pct
  FROM pg_statio_user_tables;
