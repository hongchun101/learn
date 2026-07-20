# 17 — WAL and Recovery

## Goal

You can describe the durability boundary, locate the WAL, walk the WAL
records with `pg_walinspect`, and prove checkpoint behaviour.

## Contracts

- **Contract 4** — `pg_current_wal_lsn()` and `pg_last_wal_replay_lsn()`.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/17-wal-and-recovery/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 17.1 | LSN / WAL file naming | 24-hex, 16 MB segments |
| 17.2 | Replay LSN | What the replica has applied |
| 17.3 | Forcing WAL | Any commit produces WAL |
| 17.4 | `pg_walinspect` | `pg_get_wal_records_info_*` |
| 17.5 | WAL traffic | Inserts + delete + vacuum all write WAL |
| 17.6 | LSN growth | A monotonic counter |
| 17.7 | `CHECKPOINT` | Manually trigger |
| 17.8 | LSN after checkpoint | Reset of dirty-page write horizon |

## Mental model

- The WAL is the **only** durability boundary for committed data. A
  committed transaction is durable when its `COMMIT` record is on disk.
- A checkpoint is a moment after which we believe "all earlier heap
  changes are on disk, so we can recycle WAL".
- Crash recovery replays WAL from the last checkpoint up to the last
  consistent state.

## WAL files on disk

- `pg_wal/000000010000000000000001` — file naming `0/00000001/000000010000000000000001`
  after PG12 because of LSN-to-segment mapping.
- WAL segment size is fixed (`initdb -D … --wal-segsize=64`) — 16 MB
  default; bumping to 64 MB helps with heavy write workloads.
- `archive_mode = on` + `archive_command` triggers on every WAL flush.

## Exercises

See `exercises/17-wal-and-recovery.sql`.
