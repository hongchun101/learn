-- Solutions 17
SELECT pg_current_wal_lsn();
CREATE TABLE t_17 AS SELECT g FROM generate_series(1, 1000) g;
SELECT pg_current_wal_lsn();

CHECKPOINT;

SELECT * FROM pg_stat_bgwriter;

-- pg_walinspect requires admin privileges
-- SELECT * FROM pg_get_wal_records_info_till_end_of_wal(pg_current_wal_lsn());
