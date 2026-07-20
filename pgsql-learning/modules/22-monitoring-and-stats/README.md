# 22 — Monitoring and pg_stat

## Goal

You can read every important `pg_stat_*` view, capture a snapshot, and
explain what each counter says about a workload.

## Contracts

- **Contract 2** — `pg_stat_activity`.
- **Contract 5** — `pg_stat_statements`.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/22-monitoring-and-stats/demo.sql
bash modules/22-monitoring-and-stats/scripts/snapshot-stats.sh
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 22.1 | `pg_stat_activity` | Each backend: state, query, age |
| 22.2 | `pg_locks` | Relation-level and row-level locks |
| 22.3 | `pg_stat_statements` | Normalised-query stats |
| 22.4 | `pg_stat_user_tables` | Per-table I/O and row counters |
| 22.5 | `pg_stat_progress_*` | Long-running maintenance progress |
| 22.6 | snapshot script | Cron-style stats capture |

## Mental model

- Two timings matter: `query_start` (when the query *started*) and
  `xact_start` (when the *transaction* started). The latter is the
  indicator of stale transactions holding locks.
- `n_dead_tup` per table is your primary "bloat" health metric.
- `pg_stat_statements` is the single best source for "top slow queries";
  pair it with `pg_stat_activity` to find the *current* offender.

## Five metrics that catch almost everything

| Metric | Tells you |
|--------|-----------|
| `tx_running`/`count(state = 'active')` | Stuck transactions |
| `pg_stat_user_tables.n_dead_tup` | Bloat risk |
| `pg_stat_replication.replay_lsn` vs primary | Replication lag |
| `pg_replication_slots.restart_lsn` lag | Slot outage risk |
| `pg_stat_database.deadlocks` / `conflicts` | Lock contention |

## Exercises

See `exercises/22-monitoring-and-stats.sql`.
