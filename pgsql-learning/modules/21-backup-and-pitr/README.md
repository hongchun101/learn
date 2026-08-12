# 21 — Backup and PITR

## Goal

You can describe the durability boundary, locate the WAL, walk the WAL
records with `pg_walinspect`, and prove checkpoint behaviour.

You can also:

- Pick the right backup for the right RPO / RTO target.
- Take a `pg_basebackup`, configure WAL archiving, restore a backup,
  and run PITR to a timestamp.
- Read `pg_stat_archiver` and tell whether the archive is healthy.

## Contracts

- **Contract 4** — `pg_current_wal_lsn()` and `pg_last_wal_replay_lsn()`.

## Run

```bash
# Verify settings are correct (in-cluster):
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/21-backup-and-pitr/demo.sql

# Set up WAL archiving on a host-side directory:
bash modules/21-backup-and-pitr/scripts/setup-archive.sh

# Restore + PITR drill:
bash modules/21-backup-and-pitr/scripts/point-in-time-recovery.sh
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 21.1 | Backup / archive GUCs | `archive_mode`, `archive_command`, `archive_timeout`, `wal_level` |
| 21.2 | Current WAL position | `pg_current_wal_lsn()` |
| 21.3 | Build a PITR target | A small table you can recover to |
| 21.4 | `CHECKPOINT` | Stabilise heap state |
| 21.5 | WAL after writes | Records since the previous checkpoint |
| 21.6 | `pg_stat_progress_basebackup` | Live base-backup progress |
| 21.7 | `pg_stat_archiver` | Archive success / failure counters |
| 21.8 | Recovery settings | `restore_command`, `recovery_target_time` |

## Mental model

- The WAL is the **only** durability boundary for committed data.
  A committed transaction is durable when its `COMMIT` record is
  on disk.
- A checkpoint is a moment after which we believe "all earlier
  heap changes are on disk, so we can recycle WAL".
- Crash recovery replays WAL from the last checkpoint up to the
  last consistent state.
- PITR is "crash recovery to a chosen point". Same machinery.

## Backup matrix

| Method | What you get | RPO | RTO | Best for |
|--------|--------------|-----|-----|----------|
| `pg_dump` | Logical SQL dump | hours (last dump) | hours (replay) | Small DBs, schema-only, partial restore |
| `pg_dumpall` | Global objects (roles, tablespaces) | hours | minutes | Cluster-wide settings |
| `pg_basebackup` | Full physical backup | configurable via WAL archive | minutes (start) + WAL replay | Production full backup |
| WAL archive | Continuous WAL segments | seconds | minutes (replay) | DR, PITR, replica bootstrap |

## PITR steps

1. Take a `pg_basebackup` to a known location.
2. Configure `archive_mode = on` and `archive_command` on the primary.
3. Verify with `SELECT * FROM pg_stat_archiver;`.
4. To recover:
   - Restore the base backup into a fresh PGDATA.
   - Create `recovery.signal` (PG 12+) or write `recovery.conf` (older).
   - Set in `postgresql.conf`:
     - `restore_command = 'cp /archive/%f %p'`
     - `recovery_target_time = 'YYYY-MM-DD HH:MM:SS+00'`
     - `recovery_target_action = 'promote'` (or `pause` to inspect)
5. Start the recovered cluster. It replays WAL up to the target
   timestamp, then either pauses or promotes.

## WAL files on disk

- `pg_wal/000000010000000000000001` — file naming
  `0/00000001/000000010000000000000001` after PG12 because of
  LSN-to-segment mapping.
- WAL segment size is fixed at `initdb` time (16 MB default; bump
  to 64 MB for heavy write workloads).
- `archive_mode = on` + `archive_command` triggers on every WAL
  flush.

## Exercises

See `exercises/21-backup-and-pitr.sql`.
