# 19 — Vacuum and txid wraparound

## Goal

You can read autovacuum GUCs, run `VACUUM FREEZE`, recognise bloat, and
explain the txid wraparound horizon.

## Contracts

- **Contract 4 (re-check)** — recovery depends on `xmin_freeze` tables.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/19-vacuum-and-txid-wraparound/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 19.1 | autovacuum GUCs            | The knobs that drive autovacuum runs |
| 19.2 | `VACUUM (VERBOSE, ANALYZE)` | Reports dead tuples reclaimed |
| 19.3 | `VACUUM FULL`              | Rewrites the heap; ACCESS EXCLUSIVE lock |
| 19.4 | `VACUUM FREEZE`            | Marks all visible tuples `HEAP_XMIN_FROZEN` |
| 19.5 | `pg_database.age()`        | Wraparound horizon |
| 19.6 | Live + dead tuple counts   | See `pg_stat_user_tables` |

## Mental model

- Autovacuum fires per relation once the `n_dead_tup` exceeds
  `autovacuum_vacuum_scale_factor * reltuples + autovacuum_vacuum_threshold`.
- Two regressions to recognise on sight:
  - **Bloat**: live + dead grows without bound. Cure: shorter scale factor.
    Equipment: `pg_repack` or `VACUUM FULL` (rare).
  - **Wraparound**: `age(datfrozenxid)` growing past 200M is a yellow
    flag; past 1B, you're in an anti-wraparound autovacuum cycle.
- `VACUUM FULL` is a **bulk operation that locks the table** — schedule it.
  Prefer `pg_repack` or `pg_squeeze` for online rebuild.

## txid wraparound

- xid is 32-bit unsigned; splits the epoch in halves.
- Half the xid space is reserved for "everlasting" tuples.
- A frozen tuple has `t_infomask & HEAP_XMIN_FROZEN` set; the vacuum
  marks a tuple frozen at `autovacuum_freeze_max_age`.

## Exercises

See `exercises/19-vacuum-and-txid-wraparound.sql`.
