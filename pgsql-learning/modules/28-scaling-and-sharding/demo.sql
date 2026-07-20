-- Module 28 — Scaling and Sharding
\echo === Module 28: Scaling and Sharding ===
SET search_path = sql_core, public;

\echo === 28.1 Read scaling: replicas and read-only routing ===
\echo --- Two clients, two connection strings, the reader hits the replica.
\echo --- Replica: SELECTs only; writes go to primary.

\echo === 28.2 Vertical scaling vs horizontal ===
\echo --- Vertical: bigger box, larger shared_buffers, more workers.
\echo --- Horizontal: shard by some key (region, user_id); route writes per shard.

\echo === 28.3 Replication routing concepts ===
\echo --- Same PostgreSQL, different roles:
\echo ----  app_rw (writes go to primary)
\echo ----  app_ro (reads go to any replica)

\echo === 28.4 Foreign-data-wrapper sharding (one node only) ===
\echo --- Map a "shard" per region using postgres_fdw in a coordinator
\echo --- role. We declare the syntax only.

DROP EXTENSION IF EXISTS shard_sim CASCADE;
\echo --- Use 'public.demo_shards' as the descriptor; each row says which server.

DROP TABLE IF EXISTS orders_by_region;
CREATE TABLE orders_by_region (
    id         bigint PRIMARY KEY,
    region     text NOT NULL,
    total      numeric(12,2) NOT NULL
);

\echo === 28.5 HikariCP-style read/write split (illustrative) ===
\echo --- Application side: a connection router sends SELECT-for-write tx to
\echo --- primary; SELECTs to replicas; writes to primary.

\echo === 28.6 Citus / sharding extensions ===
\echo --- CREATE EXTENSION citus;     -- not bundled
\echo --- SELECT create_distributed_table('orders_by_region', 'region');

\echo === 28.7 Decision matrix ===
\echo --- When to shard:
\echo ----   - working set > RAM by 10×
\echo ----   - vertical scaling inflects
\echo ----   - latency in different geos
\echo --- When to NOT shard:
\echo ----   - OLTP, sub-100ms queries, write-heavy on a single tenant
\echo ----   - when JOINs across shards become unworkable
\echo ----   - when a single physical box with 32 cores / 256 GB / 16 TB NVMe solves it

\echo === Module 28 complete ===
