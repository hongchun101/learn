# 26 — Locking and Deadlocks

## Goal

You can read `pg_locks`, choose the right row-lock strength
(`FOR KEY SHARE`, `FOR SHARE`, `FOR NO KEY UPDATE`, `FOR UPDATE`),
use `NOWAIT` and `SKIP LOCKED`, and reason about advisory locks.

## Contracts

- `pg_locks` (kept visible from module 22).

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/26-locking-and-deadlocks/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 26.1 | Row-level `FOR UPDATE` | Holds until COMMIT |
| 26.2 | `FOR NO KEY UPDATE` vs `FOR UPDATE` | FK triggers take the no-key variant |
| 26.3 | `FOR KEY SHARE` / `FOR SHARE` | Reads with intent to read |
| 26.4 | `SKIP LOCKED` and `NOWAIT` | Concurrent job bags; fail-fast UIs |
| 26.5 | `pg_locks` view | Lock introspection |
| 26.6 | Advisory lock `pg_advisory_lock(int8)` | Application-keyed |
| 26.7 | `pg_advisory_xact_lock` | Released on COMMIT/ROLLBACK |
| 26.8 | Deadlock detection | SQLSTATE 40P01 |

## Mental model

- Lock strength order (rows): `FOR KEY SHARE < FOR SHARE < FOR NO KEY UPDATE < FOR UPDATE`.
- Higher locks wait on lower locks; if you deadlock, the loser gets
  `40P01`.
- `pg_advisory_lock` *blocks* the requesting session until granted; the
  transaction-scoped variant is released at transaction end.
- `SKIP LOCKED` is the canonical primitive for queue-style workers
  (multiple consumers each grab a different row).

## Exercises

See `exercises/26-locking-and-deadlocks.sql`.
