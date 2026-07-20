-- Module 19 — Vacuum and txid wraparound
\echo === Module 19: Vacuum and txid wraparound ===
SET search_path = sql_core, public;

\echo === 19.1 See the autovacuum GUCs ===
SHOW autovacuum;
SHOW autovacuum_max_workers;
SHOW autovacuum_naptime;
SHOW autovacuum_vacuum_scale_factor;
SHOW autovacuum_analyze_scale_factor;
SHOW autovacuum_vacuum_cost_limit;
SHOW autovacuum_freeze_max_age;
SHOW vacuum_freeze_min_age;
SHOW vacuum_multixact_freeze_min_age;
SHOW vacuum_multixact_freeze_table_age;

\echo === 19.2 Force a tiny table through vacuum ===
DROP TABLE IF EXISTS t_vacuum CASCADE;
CREATE TABLE t_vacuum (id int, payload text) WITH (fillfactor=70);
INSERT INTO t_vacuum SELECT g, 'x' FROM generate_series(1, 1000) g;
UPDATE t_vacuum SET payload = payload || '!' WHERE id <= 500;
DELETE FROM t_vacuum WHERE id > 800;

SELECT relname,
       n_live_tup,
       n_dead_tup,
       last_autovacuum,
       last_autoanalyze
  FROM pg_stat_user_tables
 WHERE relname = 't_vacuum';

VACUUM (VERBOSE, ANALYZE) t_vacuum;

\echo === 19.3 VACUUM FULL rewrites the table (LOCK) ===
VACUUM FULL t_vacuum;

\echo === 19.4 freeze_demo: inspect xmin_freeze ===
DROP TABLE IF EXISTS freeze_demo CASCADE;
CREATE TABLE freeze_demo (id int) WITH (autovacuum_enabled=false);
INSERT INTO freeze_demo SELECT g FROM generate_series(1, 1000) g;

SELECT count(*) AS to_freeze
  FROM pg_stat_user_tables
 WHERE relname = 'freeze_demo';

VACUUM FREEZE freeze_demo;
\echo --- After FREEZE, all tuples carry HEAP_XMIN_FROZEN.

\echo === 19.5 Inspect wraparound horizon ===
SELECT datname, age(datfrozenxid) AS oldest_xid_age, datfrozenxid
  FROM pg_database
 WHERE datname = current_database();

\echo === 19.6 Sludge in action: tuples from many updates ===
DROP TABLE IF EXISTS sludge CASCADE;
CREATE TABLE sludge (id int, v int) WITH (autovacuum_enabled=false);
INSERT INTO sludge SELECT g, 0 FROM generate_series(1, 1000) g;
UPDATE sludge SET v = v + 1;        -- 1000 dead tuples

SELECT relname, n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname='sludge';
VACUUM sludge;
SELECT relname, n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname='sludge';

\echo === Module 19 complete ===
