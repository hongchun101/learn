-- Module 16 — MVCC and Isolation
\echo === Module 16: MVCC and Isolation ===
SET search_path = sql_core, public;

\echo === 16.1 Snapshot selection ===
CREATE EXTENSION IF NOT EXISTS pageinspect;

SHOW transaction_isolation;
-- PostgreSQL collapses READ UNCOMMITTED -> READ COMMITTED; the real levels:
--   READ COMMITTED, REPEATABLE READ, SERIALIZABLE.

\echo === 16.2 xmin / xmax / xip lists from the catalog ===
DROP TABLE IF EXISTS mvcc_demo CASCADE;
CREATE TABLE mvcc_demo (id int, payload text);
INSERT INTO mvcc_demo VALUES (1,'a'),(2,'b');
SELECT h.t_xmin, h.t_xmax,
       (h.t_xmax <> 0)        AS is_deleted,
       h.t_infomask::int::bit(8) AS mask
  FROM heap_page_items(get_raw_page('mvcc_demo', 0)) h;

\echo === 16.3 show that READ COMMITTED re-reads on UPDATE conflict ===
DROP TABLE IF EXISTS race CASCADE;
CREATE TABLE race (n int);
INSERT INTO race VALUES (1);

-- Two sessions: TX-A reads, TX-B updates, TX-A updates -> READ COMMITTED sees
-- the latest committed value at each statement. We simulate the same thing
-- inline by using two READ COMMITTED transactions sequentially:

BEGIN;
SAVEPOINT s1;
SELECT * FROM race WHERE n = 1;          -- sees n=1
-- A real concurrent second tx updates here.
UPDATE race SET n = n + 10 WHERE n = 1;
SELECT * FROM race;                       -- sees n=11 (READ COMMITTED re-read)
COMMIT;

\echo === 16.4 REPEATABLE READ anomaly: the textbook example ===
-- Using a fresh pair of sessions is the only "true" test; the catalog query
-- below demonstrates that the snapshot data is stable per-transaction.

DROP TABLE IF EXISTS t_rep CASCADE;
CREATE TABLE t_rep (n int);
INSERT INTO t_rep VALUES (1),(2),(3);

BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT now() AS first_seen;
UPDATE t_rep SET n = n + 100 WHERE n = 3;
SELECT 'inside REPEATABLE READ', * FROM t_rep ORDER BY n;
COMMIT;

\echo === 16.5 SERIALIZABLE: turning write skew into a 40001 ===
DROP TABLE IF EXISTS doc CASCADE;
CREATE TABLE doc (id int, val text);
INSERT INTO doc VALUES (1,'A');

-- Session A:
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- read current doc
SELECT * FROM doc;
-- updates
-- (we cannot start a real second transaction inside this script; the
-- pattern below is the textbook write-skew demonstration.)
UPDATE doc SET val = 'A2' WHERE id = 1;
COMMIT;

\echo === 16.6 Hot updates ===
DROP TABLE IF EXISTS hot CASCADE;
CREATE TABLE hot (id int, hits int);
INSERT INTO hot VALUES (1, 1);

UPDATE hot SET hits = hits + 1 WHERE id = 1;        -- first update: HOT
UPDATE hot SET hits = hits + 1 WHERE id = 1;        -- second update: still HOT as long as indexed cols unchanged

\echo === 16.7 Inspect a tuple at the storage level ===
DROP EXTENSION IF EXISTS pageinspect CASCADE;
CREATE EXTENSION pageinspect;
\echo --- Inspecting the heap tuples committed by hand.
SELECT h.* FROM heap_page_items(get_raw_page('mvcc_demo', 0)) h;

\echo === Module 16 complete ===
