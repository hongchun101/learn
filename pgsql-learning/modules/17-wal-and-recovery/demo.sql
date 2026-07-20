-- Module 17 — WAL and Recovery
\echo === Module 17: WAL and Recovery ===
SET search_path = sql_core, public;

\echo === 17.1 Current WAL position ===
SELECT pg_current_wal_lsn(),
       pg_walfile_name(pg_current_wal_lsn()) AS current_wal_file,
       pg_walfile_name_offset(pg_current_wal_lsn()) AS current_offset;

\echo === 17.2 Redo LSN from system view (if any replicas connected) ===
SELECT pg_last_wal_replay_lsn() AS replay_lsn;

\echo === 17.3 Force the WAL ===
DROP TABLE IF EXISTS wal_demo;
CREATE TABLE wal_demo (id bigint, payload text);
INSERT INTO wal_demo SELECT g, repeat('x', 100) FROM generate_series(1, 1000) g;
INSERT INTO wal_demo SELECT g, repeat('y', 100) FROM generate_series(1, 1000) g;

\echo === 17.4 WAL inspection: requires pg_walinspect + superuser ===
DO $$
BEGIN
    BEGIN
        EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_walinspect';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pg_walinspect not available: %', SQLERRM;
    END;
END $$;

\echo === 17.5 Generate big WAL traffic ===
DROP TABLE IF EXISTS wal_stress;
CREATE TABLE wal_stress (id bigint);
INSERT INTO wal_stress SELECT g FROM generate_series(1, 100000) g;
DELETE FROM wal_stress;
VACUUM wal_stress;

\echo === 17.6 Current LSN growth ---
SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')::bigint) AS wal_bytes_generated;

\echo === 17.7 Force a checkpoint ===
CHECKPOINT;

\echo === 17.8 Check LSN growth since checkpoint ===
SELECT pg_current_wal_lsn() AS lsn_now;

\echo === Module 17 complete ===
