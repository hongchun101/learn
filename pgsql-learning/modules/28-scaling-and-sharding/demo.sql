-- Module 28 — Scaling and Sharding
-- Read replicas are exercised by the docker stack (primary + replica).
-- Foreign-data-wrapper sharding is exercised on the primary by
-- pointing postgres_fdw at a local catalog table.
-- Citus is not bundled with stock postgres:16-alpine; we exercise
-- its API surface with conditional code.
\echo === Module 28: Scaling and Sharding ===
SET search_path = sql_core, public;

-- 28.1 Read scaling: verify the replica is reachable from the primary
-- via a foreign server. The stack starts both containers; this query
-- verifies the wiring.
DO $fdw$
BEGIN
    BEGIN
        EXECUTE $sql$
            CREATE EXTENSION IF NOT EXISTS postgres_fdw;
            DROP SERVER IF EXISTS replica_server CASCADE;
            CREATE SERVER replica_server
              FOREIGN DATA WRAPPER postgres_fdw
              OPTIONS (host 'replica', port '5432', dbname 'learning');
            CREATE USER MAPPING IF NOT EXISTS FOR postgres
              SERVER replica_server
              OPTIONS (user 'postgres', password 'postgres');
        $sql$;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FDW setup skipped: %', SQLERRM;
    END;
END
$fdw$;

-- 28.2 Foreign table pointing at a table that exists on the replica
-- (we use pg_class — present on every cluster).
DROP FOREIGN TABLE IF EXISTS replica_pg_class;
CREATE FOREIGN TABLE replica_pg_class (
    relname      name,
    relnamespace oid,
    relkind      char
) SERVER replica_server
  OPTIONS (schema_name 'pg_catalog', table_name 'pg_class');

\echo --- Quick reachability check:
SELECT count(*) AS replica_pg_class_rows FROM replica_pg_class;

-- 28.3 Push-down: a WHERE clause is shipped to the remote side
EXPLAIN (VERBOSE)
SELECT relname FROM replica_pg_class WHERE relkind = 'r' LIMIT 5;

-- 28.4 Local FDW: a coordinator pattern with one shard per region
-- All shards live on the local cluster for this demo. In production
-- each shard would be a separate cluster (or schema on the same cluster
-- for development).
DROP TABLE IF EXISTS shard_eu, shard_us, shard_apac CASCADE;

CREATE TABLE shard_eu   (id bigint PRIMARY KEY, region text, total numeric(12,2));
CREATE TABLE shard_us   (id bigint PRIMARY KEY, region text, total numeric(12,2));
CREATE TABLE shard_apac (id bigint PRIMARY KEY, region text, total numeric(12,2));

INSERT INTO shard_eu   SELECT g, 'EU',   random()*100 FROM generate_series(1,1000) g;
INSERT INTO shard_us   SELECT g, 'US',   random()*100 FROM generate_series(1,1000) g;
INSERT INTO shard_apac SELECT g, 'APAC', random()*100 FROM generate_series(1,1000) g;

-- 28.5 Cross-shard query: the application would UNION ALL across
-- the shards and aggregate. (In Citus, the same query goes through
-- the Citus planner.)
SELECT region, sum(total) AS gmv, count(*) AS n
  FROM (
    SELECT region, total FROM shard_eu
    UNION ALL
    SELECT region, total FROM shard_us
    UNION ALL
    SELECT region, total FROM shard_apac
  ) t
 GROUP BY region
 ORDER BY region;

-- 28.6 Routing on the application side: app_rw vs app_ro
\echo --- Application split (illustrative):
\echo --- app_rw  ->  primary (writes)
\echo --- app_ro  ->  primary OR replica (reads; replica when freshness is OK)

-- 28.7 pg_stat_statements: identify hot queries
SELECT substring(query for 80) AS query,
       calls,
       round(mean_exec_time::numeric, 1) AS mean_ms,
       round(total_exec_time::numeric, 1) AS total_ms
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 5;

-- 28.8 pg_stat_replication: are the replicas keeping up?
SELECT client_addr, state, sync_state,
       sent_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS bytes_behind
  FROM pg_stat_replication;

-- 28.9 Decision matrix (text only — this is the lesson)
\echo === Decision matrix ===
\echo --- Vertical first: bigger box, larger shared_buffers, more workers.
\echo --- Horizontal: shard by tenant (region, user_id); route writes per shard.
\echo --- When to shard:
\echo ----   working set > RAM by 10x
\echo ----   vertical scaling inflects (cost per GB doubles)
\echo ----   latency in different geos
\echo --- When NOT to shard:
\echo ----   OLTP, sub-100ms queries, write-heavy on a single tenant
\echo ----   when JOINs across shards become unworkable
\echo ----   when a single physical box with 32 cores / 256 GB / 16 TB NVMe solves it

-- 28.10 Citus syntax (only runs if citus is installed)
DO $citus$
BEGIN
    BEGIN
        EXECUTE 'CREATE EXTENSION citus';
        EXECUTE 'SELECT create_distributed_table(''shard_eu'', ''id'')';
        RAISE NOTICE 'Citus available and shard_eu distributed by id';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Citus not installed; that is fine. The exercise continues.';
    END;
END
$citus$;

-- 28.11 Cache hit ratio from pg_statio_user_tables (the key signal
-- for "do I need a bigger box or more replicas?")
SELECT round(
    100.0 * sum(heap_blks_hit)::numeric
        / nullif(sum(heap_blks_hit + heap_blks_read), 0),
  2) AS heap_cache_hit_pct
  FROM pg_statio_user_tables;

\echo === Module 28 complete ===
