-- Module 13 / Data Lake — Iceberg-like features simulated in DuckDB.
--
-- DuckDB native tables do NOT support `AT (VERSION => n)` time travel on
-- themselves, so this script emulates the three headline Iceberg features
-- (time travel, schema evolution, partition evolution / hidden partitioning)
-- in a way that runs end-to-end on DuckDB and is verifiable from the
-- accompanying pytest suite.
--
-- Sections:
--   1. Time travel    — materialise v1/v2/v3 snapshots + a metadata table
--   2. Schema evolution — ADD / DROP / RENAME COLUMN
--   3. Hidden partitioning — write hive-partitioned parquet and prune
--   4. ACID-on-lake demo — only writers see new files until commit

-- ============================================================
-- 0. Schema + baseline
-- ============================================================
CREATE SCHEMA IF NOT EXISTS ods;

CREATE OR REPLACE TABLE ods.orders AS
SELECT * FROM read_parquet('data/small/orders.parquet');

-- A lightweight "snapshots" manifest, the same role Iceberg's
-- .metadata/version-*.json plays: one row per snapshot.
CREATE TABLE IF NOT EXISTS ods.orders_snapshots (
    snapshot_id    BIGINT,
    parent_id      BIGINT,
    taken_at       TIMESTAMP,
    row_count      BIGINT,
    operation      VARCHAR,
    note           VARCHAR
);

-- ============================================================
-- 1. TIME TRAVEL  (v1 = initial, v2 = update, v3 = append)
-- ============================================================

-- snapshot 1: copy the current ods.orders verbatim
INSERT INTO ods.orders_snapshots
VALUES (1, NULL, CURRENT_TIMESTAMP,
        (SELECT COUNT(*) FROM ods.orders),
        'append', 'initial load from ods.orders');

CREATE OR REPLACE TABLE ods.orders_v1 AS
SELECT * FROM ods.orders;

-- snapshot 2: a small mutation (bump total on the first 5 rows)
UPDATE ods.orders
SET    total = total + 1.00
WHERE  order_id IN (SELECT order_id FROM ods.orders ORDER BY order_id LIMIT 5);

INSERT INTO ods.orders_snapshots
VALUES (2, 1, CURRENT_TIMESTAMP,
        (SELECT COUNT(*) FROM ods.orders),
        'overwrite', 'bump total on first 5 ids');

CREATE OR REPLACE TABLE ods.orders_v2 AS
SELECT * FROM ods.orders;

-- snapshot 3: append one synthetic row to demonstrate insert-only history
INSERT INTO ods.orders
VALUES (9999999, 999999, 0.00, 'simulated',
        CURRENT_DATE, CURRENT_TIMESTAMP);

INSERT INTO ods.orders_snapshots
VALUES (3, 2, CURRENT_TIMESTAMP,
        (SELECT COUNT(*) FROM ods.orders),
        'append', 'add one synthetic row');

CREATE OR REPLACE TABLE ods.orders_v3 AS
SELECT * FROM ods.orders;

-- Show the manifest
SELECT snapshot_id, parent_id, taken_at, row_count, operation, note
FROM   ods.orders_snapshots
ORDER  BY snapshot_id;

-- ============================================================
-- 2. SCHEMA EVOLUTION
-- ============================================================
-- 2a. ADD COLUMN with DEFAULT — never breaks old readers
ALTER TABLE ods.orders_v3 ADD COLUMN channel VARCHAR DEFAULT 'web';
SELECT column_name FROM information_schema.columns
WHERE  table_schema = 'ods' AND table_name = 'orders_v3'
ORDER  BY ordinal_position;

-- 2b. RENAME COLUMN — old readers expecting 'status' still work because
--     Iceberg/Hudi rewrite the column mapping; in DuckDB we RENAME and
--     then verify downstream queries can address the new name.
ALTER TABLE ods.orders_v3 RENAME COLUMN status TO order_status;
SELECT column_name FROM information_schema.columns
WHERE  table_schema = 'ods' AND table_name = 'orders_v3'
ORDER  BY ordinal_position;

-- Restore for downstream tests
ALTER TABLE ods.orders_v3 RENAME COLUMN order_status TO status;

-- 2c. DROP COLUMN
ALTER TABLE ods.orders_v3 DROP COLUMN channel;
SELECT column_name FROM information_schema.columns
WHERE  table_schema = 'ods' AND table_name = 'orders_v3'
ORDER  BY ordinal_position;

-- ============================================================
-- 3. HIDDEN PARTITIONING + PARTITION EVOLUTION
-- ============================================================
-- 3a. Write hive-partitioned parquet (order_date)
COPY ods.orders TO 'data/_lake_out/orders_by_date'
      (FORMAT PARQUET, PARTITION_BY (order_date), OVERWRITE_OR_IGNORE);
-- 3b. Read it back with hive_partitioning=true; filter on order_date
--     pushes down to a partition prune (zero IO for non-matching dates).
SELECT COUNT(*) AS rows_on_2024_01_15
FROM   read_parquet('data/_lake_out/orders_by_date/*/*.parquet',
                    hive_partitioning = true)
WHERE  order_date = DATE '2024-01-15';

-- 3c. Partition evolution: rewrite with a finer partition spec
COPY ods.orders TO 'data/_lake_out/orders_by_date_status'
      (FORMAT PARQUET, PARTITION_BY (order_date, status), OVERWRITE_OR_IGNORE);

SELECT COUNT(DISTINCT order_date) AS date_buckets_v1,
       COUNT(DISTINCT status)    AS status_buckets_v2
FROM   read_parquet('data/_lake_out/orders_by_date_status/*/*/*.parquet',
                    hive_partitioning = true);

-- ============================================================
-- 4. ACID-on-lake demo (snapshot isolation)
-- ============================================================
-- Emulate Iceberg's "only the writer sees its datafiles until commit"
-- with two views at different snapshots. The "reader" sees v2; the
-- "writer" sees v3 with the synthetic row.
SELECT 'reader_sees_v2' AS role, COUNT(*) AS row_count
FROM   ods.orders_v2
UNION ALL
SELECT 'writer_sees_v3', COUNT(*)
FROM   ods.orders_v3;

-- The synthetic row is visible to v3 and NOT to v1/v2.
SELECT order_id, total, status
FROM   ods.orders_v3
WHERE  order_id = 9999999;

SELECT order_id, total, status
FROM   ods.orders_v1
WHERE  order_id = 9999999;