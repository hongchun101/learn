-- Exercise 21 — Backup and PITR
SET search_path = sql_core, public;

-- Background: this is the in-cluster part of the backup / restore
-- workflow. The shell-side exercises live in scripts/setup-archive.sh
-- and scripts/point-in-time-recovery.sh.

-- Q1: Show every backup- / archive-related GUC and its current value.
-- Hint: filter pg_settings by category 'Write-Ahead Log / Archive'.

-- Q2: Capture the current WAL position, then write 100 rows into a
--     table called `pit_ex21`, and capture the new WAL position.
--     Compute the WAL delta in bytes using pg_wal_lsn_diff.

-- Q3: Force a CHECKPOINT, then read pg_stat_archiver and report:
--     archived_count, last_archived_wal, failed_count.

-- Q4: Configure a *test* archive_command that writes into /tmp/pg_archive_test/
--     (you don't need to actually run the archive; just describe what
--     the command would be). Then revert it to '' (empty).

-- Q5: Read pg_stat_progress_basebackup. If empty, run a base backup
--     from another shell (or describe the command you would run) and
--     re-read.

-- Q6: Inspect the recovery GUCs we would set on a recovered cluster:
--     SHOW restore_command, recovery_target_action, recovery_target_inclusive.
--     These only matter when recovery.signal exists; describe how to
--     enable recovery mode for a PITR drill.

-- Q7: Describe (in SQL comments) the PITR workflow you would use to
--     recover the cluster to a specific timestamp.
