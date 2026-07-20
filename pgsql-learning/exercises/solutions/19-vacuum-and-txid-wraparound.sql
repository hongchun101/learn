-- Solutions 19
SET search_path = sql_core, public;

-- Q1
SHOW autovacuum;
SHOW autovacuum_max_workers;
SHOW autovacuum_vacuum_scale_factor;

-- Q2
DROP TABLE IF EXISTS t_vac CASCADE;
CREATE TABLE t_vac (id int, v int);
INSERT INTO t_vac SELECT g, 0 FROM generate_series(1, 1000) g;
UPDATE t_vac SET v = v + 1;
VACUUM (VERBOSE, ANALYZE) t_vac;

-- Q3
SELECT datname, age(datfrozenxid) FROM pg_database WHERE datname='learning';
