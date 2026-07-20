-- =====================================================================
-- Module 04 / Hadoop — DuckDB simulation of HDFS layout and MapReduce
-- =====================================================================
--
-- Real HDFS runs on a JVM cluster. We cannot run a NameNode/DataNode
-- inside DuckDB, but we CAN emulate the on-disk artefacts that HDFS
-- produces, so the rest of the warehouse curriculum can reason about
-- "where the bytes live" and "how replication works" without a cluster.
--
-- What this file builds (all in the schema `hdfs_sim`):
--
--   1. datanodes              -- 6 worker nodes on 3 racks
--   2. rack_topology          -- /rack1, /rack2, /rack3 (the DNS tree)
--   3. blocks                 -- HDFS blocks carved out of source parquet
--   4. inode                  -- NameNode metadata (file -> blocks -> DN)
--   5. replicas               -- block_id -> replica datanodes
--   6. block_user             -- mini block of `users` (64 MB worth)
--   7. block_orders_a/b       -- orders split into 2 blocks by hash(order_id)
--   8. block_items_a/b/c      -- order_items split into 3 blocks by hash(order_id)
--   9. v_rack_distance        -- distance() between any two racks
--  10. word_count_split/map   -- MapReduce mapper emulated as a view
--  11. word_count_shuffle/reduce -- reducer emulated as a CTE
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS hdfs_sim;
USE hdfs_sim;

-- ---------------------------------------------------------------------
-- ch01 + ch03: cluster topology (DataNodes + racks)
--
-- In a real Hadoop cluster, `dfs.replication` defaults to 3 and the
-- NameNode's "Replica Placement Policy" prefers:
--   - one replica on the writer's local node,
--   - one replica on a different rack,
--   - one replica on the same rack as the second.
-- We model that with 6 nodes / 3 racks and let the test assert the
-- "two-of-three-racks" rule on every replicated block.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS hdfs_sim.datanodes;
CREATE TABLE hdfs_sim.datanodes (
    dn_id      VARCHAR PRIMARY KEY,   -- 'dn1' .. 'dn6'
    rack_path  VARCHAR NOT NULL,      -- '/rack1', '/rack2', '/rack3'
    capacity_mb BIGINT NOT NULL,
    used_mb    BIGINT NOT NULL
);

INSERT INTO hdfs_sim.datanodes VALUES
    ('dn1', '/rack1', 1024, 128),
    ('dn2', '/rack1', 1024, 256),
    ('dn3', '/rack2', 1024, 128),
    ('dn4', '/rack2', 1024, 128),
    ('dn5', '/rack3', 1024, 256),
    ('dn6', '/rack3', 1024, 128);

DROP TABLE IF EXISTS hdfs_sim.rack_topology;
CREATE TABLE hdfs_sim.rack_topology AS
SELECT DISTINCT rack_path FROM hdfs_sim.datanodes;

-- Distance between racks: 0 = same, 1 = different (simplified).
DROP TABLE IF EXISTS hdfs_sim.v_rack_distance;
CREATE TABLE hdfs_sim.v_rack_distance AS
SELECT a.rack_path AS rack_a,
       b.rack_path AS rack_b,
       CASE WHEN a.rack_path = b.rack_path THEN 0 ELSE 1 END AS distance
FROM hdfs_sim.rack_topology a CROSS JOIN hdfs_sim.rack_topology b;

-- ---------------------------------------------------------------------
-- ch02 + ch03: blocks (the 128 MB chunks HDFS writes)
--
-- Real HDFS carves a file into 128 MB blocks (dfs.blocksize). The
-- `blocks` table is the NameNode's view: block_id, file path, byte
-- range, owning datanode. We partition our parquet tables by a
-- deterministic hash so the test can re-derive which rows live in
-- which block.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS hdfs_sim.blocks;
CREATE TABLE hdfs_sim.blocks (
    block_id   VARCHAR PRIMARY KEY,     -- blk_<file>_<idx>
    file_path  VARCHAR NOT NULL,        -- '/data/orders.parquet'
    byte_start BIGINT NOT NULL,
    byte_end   BIGINT NOT NULL,
    len_bytes  BIGINT NOT NULL
);

INSERT INTO hdfs_sim.blocks VALUES
    ('blk_users_0',      '/data/users.parquet',       0,    65536, 65536),
    ('blk_orders_0',     '/data/orders.parquet',      0,   131072, 131072),
    ('blk_orders_1',     '/data/orders.parquet', 131072,   262144, 131072),
    ('blk_items_0',      '/data/order_items.parquet', 0,   131072, 131072),
    ('blk_items_1',      '/data/order_items.parquet', 131072, 262144, 131072),
    ('blk_items_2',      '/data/order_items.parquet', 262144, 393216, 131072),
    ('blk_products_0',   '/data/products.parquet',    0,    65536, 65536);

-- ---------------------------------------------------------------------
-- inode: NameNode's directory tree (file -> ordered block list)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS hdfs_sim.inode;
CREATE TABLE hdfs_sim.inode (
    inode_id  BIGINT PRIMARY KEY,
    parent_id BIGINT,                   -- NULL for the root
    name      VARCHAR NOT NULL,
    is_dir    BOOLEAN NOT NULL,
    block_seq INTEGER                   -- NULL when is_dir = true
);

INSERT INTO hdfs_sim.inode VALUES
    (1, NULL, '/',           TRUE,  NULL),
    (2, 1,    'data',        TRUE,  NULL),
    (3, 2,    'orders.parquet',  FALSE, 1),
    (4, 2,    'order_items.parquet', FALSE, 1),
    (5, 2,    'users.parquet',    FALSE, 1),
    (6, 2,    'products.parquet', FALSE, 1),
    -- block sub-entries (a file points to its blocks by inode)
    (10, 3, 'blk_orders_0', FALSE, NULL),
    (11, 3, 'blk_orders_1', FALSE, NULL),
    (12, 4, 'blk_items_0',  FALSE, NULL),
    (13, 4, 'blk_items_1',  FALSE, NULL),
    (14, 4, 'blk_items_2',  FALSE, NULL),
    (15, 5, 'blk_users_0',  FALSE, NULL),
    (16, 6, 'blk_products_0', FALSE, NULL);

-- ---------------------------------------------------------------------
-- ch03 + ch04: replicas (block_id -> datanode list) with rack awareness
--
-- The replication factor is 3 by default. The NameNode picks replicas
-- so that two of the three live on DIFFERENT racks (so losing one
-- rack doesn't lose data). We make that explicit and testable.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS hdfs_sim.replicas;
CREATE TABLE hdfs_sim.replicas (
    block_id VARCHAR NOT NULL,
    dn_id    VARCHAR NOT NULL,
    PRIMARY KEY (block_id, dn_id)
);

INSERT INTO hdfs_sim.replicas VALUES
    -- orders blocks: replicas spread across 3 different racks
    ('blk_orders_0',   'dn1'), ('blk_orders_0', 'dn3'), ('blk_orders_0', 'dn5'),
    ('blk_orders_1',   'dn2'), ('blk_orders_1', 'dn4'), ('blk_orders_1', 'dn6'),
    -- items blocks: each block uses a different rack triple
    ('blk_items_0',    'dn1'), ('blk_items_0',  'dn4'), ('blk_items_0',  'dn6'),
    ('blk_items_1',    'dn2'), ('blk_items_1',  'dn3'), ('blk_items_1',  'dn5'),
    ('blk_items_2',    'dn1'), ('blk_items_2',  'dn3'), ('blk_items_2',  'dn5'),
    -- single-block files: 3 replicas on 3 racks
    ('blk_users_0',    'dn2'), ('blk_users_0',  'dn4'), ('blk_users_0',  'dn6'),
    ('blk_products_0', 'dn1'), ('blk_products_0','dn3'), ('blk_products_0','dn5');

-- ---------------------------------------------------------------------
-- ch02: HDFS file-listing SQL — emulate `hdfs dfs -ls /data`
-- DuckDB has no real "ls" — but we can build the same view from
-- `inode` + `blocks` + `replicas`.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS hdfs_sim.v_hdfs_ls;
CREATE VIEW hdfs_sim.v_hdfs_ls AS
-- files in /data only (exclude block inodes and dirs)
WITH data_files AS (
    SELECT inode_id, name FROM hdfs_sim.inode
    WHERE parent_id = 2                       -- inode 2 = '/data'
      AND is_dir   = FALSE
),
blocks_per_file AS (
    SELECT i.inode_id, i.name, b.block_id, b.len_bytes
    FROM   data_files i
    JOIN   hdfs_sim.blocks b
      ON   b.file_path = '/data/' || i.name
)
SELECT b.name                                  AS file_name,
       COUNT(DISTINCT r.dn_id)                 AS replication,
       SUM(b.len_bytes)                        AS total_bytes,
       LIST(DISTINCT d.rack_path ORDER BY d.rack_path) AS racks
FROM   blocks_per_file b
LEFT JOIN hdfs_sim.replicas r ON r.block_id = b.block_id
LEFT JOIN hdfs_sim.datanodes d ON d.dn_id = r.dn_id
GROUP  BY b.inode_id, b.name
ORDER  BY b.name;
-- ch06: MapReduce emulation — word count over `user_name`.
--
-- Real MapReduce: mappers emit (word, 1) key/value pairs, the shuffle
-- groups by key, reducers sum. DuckDB gives us GROUP BY for the same
-- effect. We show BOTH the explicit 2-stage pipeline and the
-- optimised one-pass form so the comparison is visible.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS hdfs_sim.word_count_split;
-- mapper: project (word, 1) per user
CREATE VIEW hdfs_sim.word_count_split AS
SELECT u.user_name AS word, CAST(1 AS BIGINT) AS cnt
FROM   ods.users u
WHERE  u.user_name IS NOT NULL;

-- one-pass reducer (what a Hive/Spark job would compile to):
DROP VIEW IF EXISTS hdfs_sim.word_count;
CREATE VIEW hdfs_sim.word_count AS
SELECT word, SUM(cnt) AS total
FROM   hdfs_sim.word_count_split
GROUP  BY word
ORDER  BY total DESC;

-- explicit two-stage emulation: mapper writes to a "shuffle buffer",
-- reducer drains it.
DROP TABLE IF EXISTS hdfs_sim.shuffle_buffer;
CREATE TABLE hdfs_sim.shuffle_buffer AS
SELECT word, cnt FROM hdfs_sim.word_count_split WHERE length(word) <= 3;

DROP VIEW IF EXISTS hdfs_sim.word_count_reduced;
CREATE VIEW hdfs_sim.word_count_reduced AS
SELECT word, SUM(cnt) AS total
FROM   hdfs_sim.shuffle_buffer
GROUP  BY word
ORDER  BY total DESC;

-- ---------------------------------------------------------------------
-- ch06: MapReduce "join + aggregate" — orders grouped by status,
-- emulating a mapper that projects (status, 1, total) and a reducer
-- that sums counts and totals. Used by the test as a smoke check.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS hdfs_sim.order_status_split;
CREATE VIEW hdfs_sim.order_status_split AS
SELECT o.status                       AS status,
       CAST(1 AS BIGINT)              AS one,
       CAST(o.total AS DOUBLE)        AS total
FROM   ods.orders o;

DROP VIEW IF EXISTS hdfs_sim.order_status_reduced;
CREATE VIEW hdfs_sim.order_status_reduced AS
SELECT status,
       SUM(one)   AS order_cnt,
       SUM(total) AS gmv
FROM   hdfs_sim.order_status_split
GROUP  BY status
ORDER  BY gmv DESC;

-- ---------------------------------------------------------------------
-- ch05: YARN-style queue accounting — simulate concurrent app
-- allocations. In YARN, the ResourceManager (RM) hands out
-- `<memory, vcore>` containers to apps from named queues.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS hdfs_sim.yarn_queues;
CREATE TABLE hdfs_sim.yarn_queues (
    queue      VARCHAR PRIMARY KEY,
    capacity_mb BIGINT NOT NULL,
    max_mb     BIGINT NOT NULL
);
INSERT INTO hdfs_sim.yarn_queues VALUES
    ('root.default',  4096, 8192),
    ('root.ETL',      2048, 4096),
    ('root.adhoc',    1024, 2048);

DROP TABLE IF EXISTS hdfs_sim.yarn_apps;
CREATE TABLE hdfs_sim.yarn_apps (
    app_id    VARCHAR PRIMARY KEY,
    queue     VARCHAR NOT NULL,
    mem_mb    BIGINT  NOT NULL,
    vcore     INTEGER NOT NULL,
    state     VARCHAR NOT NULL
);
INSERT INTO hdfs_sim.yarn_apps VALUES
    ('application_1700000000000_0001', 'root.ETL',     1024, 1, 'RUNNING'),
    ('application_1700000000000_0002', 'root.ETL',     1024, 1, 'RUNNING'),
    ('application_1700000000000_0003', 'root.adhoc',    512, 1, 'RUNNING'),
    ('application_1700000000000_0004', 'root.default', 2048, 2, 'ACCEPTED');

DROP VIEW IF EXISTS hdfs_sim.yarn_queue_usage;
CREATE VIEW hdfs_sim.yarn_queue_usage AS
SELECT q.queue,
       q.capacity_mb,
       COALESCE(SUM(CASE WHEN a.state = 'RUNNING' THEN a.mem_mb ELSE 0 END), 0) AS used_mb,
       q.capacity_mb - COALESCE(SUM(CASE WHEN a.state = 'RUNNING' THEN a.mem_mb ELSE 0 END), 0) AS free_mb
FROM   hdfs_sim.yarn_queues q
LEFT JOIN hdfs_sim.yarn_apps a ON a.queue = q.queue
GROUP  BY q.queue, q.capacity_mb;

-- ---------------------------------------------------------------------
-- ch07: Hadoop ecosystem "family tree" — which tool replaces which
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS hdfs_sim.ecosystem;
CREATE TABLE hdfs_sim.ecosystem (
    tool         VARCHAR PRIMARY KEY,
    layer        VARCHAR NOT NULL,
    replaces     VARCHAR,                  -- NULL if new layer
    use_case     VARCHAR NOT NULL
);
INSERT INTO hdfs_sim.ecosystem VALUES
    ('HDFS',         'storage',  NULL,           'durable distributed filesystem'),
    ('MapReduce',    'compute',  NULL,           'batch shuffle framework'),
    ('YARN',         'resource', NULL,           'cluster resource manager'),
    ('Hive',         'sql',      'MapReduce',    'SQL-on-Hadoop batch warehouse'),
    ('Spark',        'compute',  'MapReduce',    'in-memory DAG compute'),
    ('Pig',          'script',   'MapReduce',    'dataflow scripting'),
    ('Oozie',        'schedule', NULL,           'workflow + coordinator jobs'),
    ('Sqoop',        'etl',      NULL,           'RDBMS <-> HDFS bulk copy'),
    ('Flume',        'etl',      NULL,           'log streaming into HDFS'),
    ('HBase',        'nosql',    NULL,           'random read/write on HDFS'),
    ('Presto/Trino', 'sql',      'Hive',         'interactive federated SQL'),
    ('Iceberg',      'table',    NULL,           'ACID table format over HDFS');

-- ---------------------------------------------------------------------
-- ch08: when to use Hadoop — a quick decision rubric
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS hdfs_sim.workload_fit;
CREATE TABLE hdfs_sim.workload_fit (
    pattern          VARCHAR PRIMARY KEY,
    fits_hadoop      BOOLEAN NOT NULL,
    better_alternative VARCHAR
);
INSERT INTO hdfs_sim.workload_fit VALUES
    ('multi-TB batch ETL with nightly SLA',    TRUE,  NULL),
    ('< 100 GB interactive BI dashboard',     FALSE, 'ClickHouse / DuckDB / Snowflake'),
    ('streaming + seconds-latency alerting',   FALSE, 'Kafka + Flink'),
    ('random point lookup on 100 GB keyspace', FALSE, 'HBase / Redis / DynamoDB'),
    ('historical log archive (cold storage)',  TRUE,  NULL),
    ('iterative ML over feature parquet',      FALSE, 'Spark on dedicated cluster'),
    ('data lake with schema evolution',        TRUE,  NULL);

-- ---------------------------------------------------------------------
-- Anchors used by tests/test_hadoop.py
--
--   v_hdfs_ls         -- read for ch02 (file/block/replica listing)
--   replicas          -- read for ch03 + ch04 (rack awareness)
--   word_count        -- read for ch06 (MapReduce word count)
--   order_status_reduced -- read for ch06 (mapper/reducer shape)
--   yarn_queue_usage  -- read for ch05 (YARN accounting)
--   ecosystem         -- read for ch07 (tool family tree)
-- ---------------------------------------------------------------------

-- Touch every view once so the test fixture can rely on them existing.
SELECT * FROM hdfs_sim.v_hdfs_ls;
SELECT * FROM hdfs_sim.word_count LIMIT 5;
SELECT * FROM hdfs_sim.word_count_reduced LIMIT 5;
SELECT * FROM hdfs_sim.order_status_reduced;
SELECT * FROM hdfs_sim.yarn_queue_usage;
SELECT * FROM hdfs_sim.ecosystem ORDER BY layer, tool;
SELECT * FROM hdfs_sim.workload_fit ORDER BY fits_hadoop DESC, pattern;
SELECT COUNT(*) AS n_blocks FROM hdfs_sim.blocks;
SELECT COUNT(*) AS n_replicas FROM hdfs_sim.replicas;
SELECT COUNT(*) AS n_dn FROM hdfs_sim.datanodes;