-- Module 21 — Backup and PITR
\echo === Module 21: Backup and PITR ===

\echo === 21.1 Current WAL position and archive settings (from outside psql) ===
\echo (run scripts/backup-base.sh from the host side; demo SELECTs are below.)
SELECT current_setting('archive_mode')        AS archive_mode,
       current_setting('archive_command')     AS archive_command,
       current_setting('archive_timeout')     AS archive_timeout,
       current_setting('wal_level')           AS wal_level;

\echo === 21.2 Snapshot of one row, then we use it as a PITR target ===
DROP TABLE IF EXISTS row_demo;
CREATE TABLE row_demo (id int, val text);
INSERT INTO row_demo VALUES (1,'A');
SELECT pg_walfile_name(pg_current_wal_lsn()) AS wal_segment_at_insert1;

\echo === 21.3 List everything in pg_stat_progress_basebackup ===
SELECT * FROM pg_stat_progress_basebackup;

\echo === Module 21 complete ===
