# 21 — Backup and PITR

## Goal

You can take a `pg_basebackup`, set up `archive_command`, restore to a
chosen LSN, and reason about RPO/RTO.

## Contracts

- **Contract 4** — recovery uses `pg_last_wal_replay_lsn()`.

## Run

```bash
bash modules/21-backup-and-pitr/scripts/setup-archive.sh
bash modules/21-backup-and-pitr/scripts/point-in-time-recovery.sh
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 21.1 | `archive_command`    | Shell command run after each WAL segment |
| 21.2 | `archive_timeout`    | Force a switch when idle |
| 21.3 | `pg_basebackup`      | `-Ft -z -X stream` for tar compressed w/ WAL |
| 21.4 | `recovery.signal`    | Tells the server to enter recovery mode |
| 21.5 | `recovery_target_lsn` | The LSN you stop at |
| 21.6 | Timeline history    | `historyfile` lets a previously forked cluster rejoin |

## RPO and RTO

- **RPO** (Recovery Point Objective) = max data loss you can tolerate.
  - `RPO = 0`: synchronous replication (write waits for replica).
  - `RPO <= N sec`: archive every N seconds + `archive_timeout=N`.
- **RTO** (Recovery Time Objective) = max time to bring the DB up.
  - Faster: pre-warmed replica; cloud provider does this.
  - Slower: restoring a `pg_basebackup` from cold storage.

## Exercises

See `exercises/21-backup-and-pitr.sql`.
