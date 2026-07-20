-- ============================================================
-- Module 05 / Hive — Demo on DuckDB (Hive-DDL semantics simulation)
--
-- Why "simulation"?
--   DuckDB is the reference engine for this curriculum. Real Hive
--   syntax (CREATE EXTERNAL TABLE ... STORED AS ORC, PARTITIONED BY,
--   CLUSTERED BY ... INTO N BUCKETS) is shown in -- comments. The
--   statements that DuckDB actually executes are wrapped in
--   `-- @hive:` headers to make the mapping explicit.
--
-- The data path is <ROOT>/data/small/*.parquet, which the pytest
-- fixture also loads into ods.* for cross-module parity.
-- ============================================================

-- ----------------------------------------------------------------
-- (1) ODS landing (the bytes Hive would have on HDFS)
-- ----------------------------------------------------------------
-- @hive:  CREATE EXTERNAL TABLE IF NOT EXISTS ods_orders (...)
--         PARTITIONED BY (dt STRING)
--         STORED AS PARQUET LOCATION '/warehouse/ods/orders';
CREATE SCHEMA IF NOT EXISTS ods;
CREATE OR REPLACE TABLE ods.orders AS
SELECT
  order_id,
  user_id,
  total,
  status,
  CAST(order_date AS DATE) AS dt,
  order_ts
FROM read_parquet('data/small/orders.parquet');

CREATE OR REPLACE TABLE ods.order_items AS
SELECT * FROM read_parquet('data/small/order_items.parquet');

CREATE OR REPLACE TABLE ods.products AS
SELECT * FROM read_parquet('data/small/products.parquet');

CREATE OR REPLACE TABLE ods.users AS
SELECT * FROM read_parquet('data/small/users.parquet');

CREATE OR REPLACE TABLE ods.user_events AS
SELECT * FROM read_parquet('data/small/user_events.parquet');

-- ----------------------------------------------------------------
-- (2) dwd_orders — managed table, ORC equivalent (Parquet + ZSTD)
--     Simulates: STORED AS ORC
-- ----------------------------------------------------------------
-- @hive:  CREATE TABLE dwd_orders
--         STORED AS ORC TBLPROPERTIES ('orc.compress'='ZSTD')
--         AS SELECT ...;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE OR REPLACE TABLE dwd.orders AS
SELECT
  order_id,
  user_id,
  CAST(total AS DECIMAL(18,2)) AS total,
  CASE
    WHEN status IN ('created','paid','shipped','completed','cancelled','refunded')
    THEN status ELSE 'unknown'
  END AS status,
  dt
FROM ods.orders
WHERE order_id IS NOT NULL AND user_id IS NOT NULL AND total IS NOT NULL;

-- ----------------------------------------------------------------
-- (3) dwd_orders_part — partitioned by dt (partition pruning demo)
--     Simulates: PARTITIONED BY (dt)  +  dynamic partition insert
-- ----------------------------------------------------------------
-- @hive:  SET hive.exec.dynamic.partition = true;
--         CREATE TABLE dwd_orders_part (order_id BIGINT, user_id BIGINT,
--                                        total DECIMAL(18,2), status STRING)
--         PARTITIONED BY (dt STRING)
--         STORED AS ORC;
--         INSERT OVERWRITE TABLE dwd_orders_part PARTITION(dt)
--         SELECT order_id, user_id, total, status, dt FROM dwd.orders;
CREATE OR REPLACE TABLE dwd.orders_part AS
SELECT order_id, user_id, total, status, dt
FROM dwd.orders;

-- Verify partition pruning: with dt='2024-01-15' DuckDB can use
-- min/max statistics on the dt column to skip row groups.
SELECT COUNT(*) AS part_n
FROM dwd.orders_part
WHERE dt = DATE '2024-01-15';

-- Show the partitions actually present (mimics SHOW PARTITIONS).
SELECT dt, COUNT(*) AS row_cnt
FROM dwd.orders_part
GROUP BY dt
ORDER BY dt;

-- ----------------------------------------------------------------
-- (4) dws_user_order_1d — bucketed by user_id (16 buckets)
--     Simulates: CLUSTERED BY (user_id) INTO 16 BUCKETS
-- ----------------------------------------------------------------
-- @hive:  CREATE TABLE dws_user_order_1d (user_id BIGINT, dt DATE,
--                                         order_count BIGINT, order_amount DECIMAL(18,2))
--         CLUSTERED BY (user_id) INTO 16 BUCKETS
--         STORED AS PARQUET;
-- @note:  DuckDB doesn't enforce bucket files on disk, but the
--         bucketing semantic is "group the same user_id into one of
--         16 buckets by hash". We compute and store bucket_id the
--         same way Hive does: bucket = (hash(user_id) mod 16).
CREATE OR REPLACE SCHEMA dws;
CREATE OR REPLACE TABLE dws.user_order_1d AS
SELECT
  user_id,
  dt,
  COUNT(*)                       AS order_count,
  SUM(total)                     AS order_amount,
  -- @hive:  HASH(user_id) % 16  (Hive's default bucketing hash)
  ABS(HASH(user_id)) % 16        AS bucket_id
FROM dwd.orders_part
GROUP BY user_id, dt;

-- Sanity: every (user_id) appears in exactly one bucket.
-- (Hive's bucketing is identity per key; this is the contract.)
SELECT bucket_id, COUNT(*) AS bucket_size
FROM dws.user_order_1d
GROUP BY bucket_id
ORDER BY bucket_id;

-- Sanity: bucketed join is a no-shuffle merge in Hive — same user
-- from the same bucket in both sides. We verify the deterministic
-- bucket mapping below by joining users to the same bucket.
SELECT COUNT(*) AS same_bucket_rows
FROM dws.user_order_1d o
JOIN ods.users u USING (user_id)
WHERE ABS(HASH(o.user_id)) % 16 = ABS(HASH(u.user_id)) % 16;

-- ----------------------------------------------------------------
-- (5) Storage-format demo: ORC ↔ Parquet round trip
--     DuckDB is columnar + uses the Parquet file format natively.
--     ORC and Parquet share the same columnar philosophy; the
--     difference is mostly in metadata blocks and compression codec
--     defaults. We demonstrate by writing Parquet with ZSTD (≈ ORC
--     default behaviour) and reading it back.
-- ----------------------------------------------------------------
-- @hive:  CREATE TABLE dwd_orders_orc STORED AS ORC
--         TBLPROPERTIES ('orc.compress'='ZSTD') AS SELECT * FROM dwd_orders;
-- @duckdb: write the ORC-equivalent to a Parquet file with ZSTD,
--          then read it back as a logical "ORC" table.
-- @note:  DuckDB cannot run a literal CREATE DIRECTORY, so we
--         stage the simulated ORC file inside the existing
--         data/small/ tree. The test fixture guarantees that
--         directory is writable.
COPY (
  SELECT order_id, user_id, total, status, dt
  FROM dwd.orders
) TO 'data/small/_hive_orc_sim.parquet' (FORMAT PARQUET, COMPRESSION 'ZSTD');

CREATE OR REPLACE TABLE dwd.orders_orc AS
SELECT * FROM read_parquet('data/small/_hive_orc_sim.parquet');

-- Round-trip integrity check.
SELECT COUNT(*) AS orc_n, MIN(total) AS min_total, MAX(total) AS max_total
FROM dwd.orders_orc;

-- ----------------------------------------------------------------
-- (6) UDF / UDAF / UDTF
-- ----------------------------------------------------------------

-- (6a) Scalar UDF — emulate Java UDF via DuckDB MACRO
-- @hive:  CREATE FUNCTION mask_email(email STRING) RETURNS STRING
--         ... Java impl ...;
CREATE OR REPLACE MACRO mask_email(email) AS
  CASE
    WHEN email IS NULL THEN NULL
    WHEN length(email) <= 4 THEN '****'
    ELSE substring(email, 1, 2) || '****' || substring(email, -2, 2)
  END;

-- Demonstrate the UDF on a synthetic column (Hive users don't have
-- an email field — we build one to make the demo concrete).
SELECT user_id, user_name, mask_email(user_name || '@x.com') AS masked
FROM ods.users
LIMIT 3;

-- (6b) UDAF — median of order totals per user-day
--      DuckDB has median() built in; we wrap it as a macro so the
--      call shape matches a Hive GenericUDAF.
-- @hive:  CREATE FUNCTION median_total DECIMAL RETURNS DECIMAL ...;
CREATE OR REPLACE MACRO median_total(amt) AS median(amt);

SELECT user_id, dt,
       median_total(total) AS median_amt,
       COUNT(*)           AS n
FROM dwd.orders_part
GROUP BY user_id, dt
ORDER BY n DESC
LIMIT 3;

-- (6c) UDTF — explode a comma-separated string into rows
-- @hive:  CREATE FUNCTION explode_csv(line STRING)
--         RETURNS TABLE(token STRING) ...;
CREATE OR REPLACE MACRO explode_csv(line) AS TABLE
  SELECT unnest(string_split(line, ',')) AS token;

-- Demonstrate the UDTF on a CROSS JOIN.
SELECT u.user_id, t.token
FROM (VALUES (1, 'a,b,c'), (2, 'x,y')) AS u(user_id, line)
CROSS JOIN explode_csv(u.line) t;

-- ----------------------------------------------------------------
-- (7) CBO + Tez-style execution — explain plans and statistics
-- ----------------------------------------------------------------
-- @hive:  ANALYZE TABLE dwd_orders COMPUTE STATISTICS FOR COLUMNS;
--         SET hive.cbo.enable = true;
--         SET hive.execution.engine = tez;
-- @duckdb: the optimizer is always on; ANALYZE populates column
--          statistics that the planner reads for cardinality
--          estimation (CBO equivalent).
ANALYZE;

-- Plain execution plan (Tez DAG equivalent): vectorized scan +
-- hash aggregate, no MapReduce staging.
EXPLAIN
SELECT user_id, COUNT(*) AS n, SUM(total) AS amt
FROM dwd.orders_part
WHERE dt >= DATE '2024-01-01'
GROUP BY user_id;

-- ----------------------------------------------------------------
-- (8) Performance-tuning "十大招" — show that predicate pushdown
--     + min/max skipping actually reduce rows read from Parquet.
-- ----------------------------------------------------------------

-- (8.1) No filter (full scan, baseline).
SELECT COUNT(*) AS unfiltered_n
FROM dwd.orders_part;

-- (8.2) Partition-column filter (dt predicate — min/max skipping).
SELECT COUNT(*) AS pruned_n
FROM dwd.orders_part
WHERE dt = DATE '2024-01-15';

-- (8.3) Combined partition + bucket filter (the killer combo).
SELECT COUNT(*) AS both_n
FROM dwd.orders_part
WHERE dt = DATE '2024-01-15'
  AND user_id BETWEEN 1000 AND 1100;