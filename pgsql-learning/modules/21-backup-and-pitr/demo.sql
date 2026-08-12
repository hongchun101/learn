-- Module 21 — Backup and PITR
-- This module teaches the full backup / restore / PITR workflow.
-- Most of the action happens in scripts/setup-archive.sh and
-- scripts/point-in-time-recovery.sh; the SQL here verifies that the
-- pieces are in place and exercises the catalog.
\echo === Module 21: Backup and PITR ===
SET search_path = sql_core, public;

-- 21.1 Backup / archive GUCs and their current values
SELECT name, setting, unit, category
  FROM pg_settings
 WHERE name IN (
   'archive_mode',
   'archive_command',
   'archive_timeout',
   'wal_level',
   'max_wal_senders',
   'max_wal_size',
   'min_wal_size',
   'wal_compression',
   'full_page_writes',
   'checkpoint_completion_target'
 )
 ORDER BY name;

-- 21.2 Current WAL position
SELECT pg_current_wal_lsn() AS lsn_now,
       pg_walfile_name(pg_current_wal_lsn()) AS wal_file,
       pg_walfile_name_offset(pg_current_wal_lsn()) AS wal_offset;

-- 21.3 Build a tiny dataset that we will back up
DROP TABLE IF EXISTS pitr_target;
CREATE TABLE pitr_target (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label        text NOT NULL,
    inserted_at  timestamptz NOT NULL DEFAULT now()
);

-- Tag this batch with a known timestamp we will use as a PITR target
SELECT now() AS batch_a_ts \gset

INSERT INTO pitr_target (label) VALUES
 ('batch-a-1'), ('batch-a-2'), ('batch-a-3');

\echo --- After batch A, before more WAL is generated, capture state:
SELECT count(*) AS batch_a_count FROM pitr_target;
SELECT * FROM pitr_target ORDER BY id;

-- 21.4 Force a CHECKPOINT to stabilise the heap
CHECKPOINT;

-- 21.5 WAL records since the last checkpoint
SELECT pg_current_wal_lsn() AS lsn_after_batch_a;

\echo === 21.6 pg_stat_progress_basebackup (live during a base backup) ===
-- This view only has rows during an in-progress pg_basebackup.
-- Run scripts/setup-archive.sh from another shell to see rows here.
SELECT pid, phase,
       backup_total, backup_streamed,
       tablespaces_total, tablespaces_streamed
  FROM pg_stat_progress_basebackup;

-- 21.7 pg_stat_archiver — the postmaster's archive status
SELECT archived_count, last_archived_wal,
       last_archived_time,
       failed_count,   last_failed_wal,
       last_failed_time
  FROM pg_stat_archiver;

-- 21.8 Verify the recovery configuration we would use for PITR
-- These settings only matter when recovery.signal is present.
SHOW restore_command;
SHOW recovery_target_action;     -- pause | promote | shutdown
SHOW recovery_target_inclusive;  -- true means target inclusive

\echo --- To test recovery:
\echo ---   1. take a base backup: pg_basebackup -D /tmp/backup_X
\echo ---   2. archive WAL: configure archive_command to copy pg_wal/*
\echo ---   3. recover: edit recovery.signal + postgresql.conf:
\echo ---        restore_command = 'cp /path/to/archive/%f %p'
\echo ---        recovery_target_time = 'YYYY-MM-DD HH:MM:SS+00'
\echo ---        recovery_target_action = 'promote'
\echo ---   4. start the recovered cluster: pg_ctl start

\echo === Module 21 complete ===
