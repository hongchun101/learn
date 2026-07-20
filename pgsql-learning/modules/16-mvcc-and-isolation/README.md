# 16 — MVCC and Isolation

## Goal

You can describe the visibility rule for `(xmin, xmax, infomask)`,
explain how `READ COMMITTED`, `REPEATABLE READ`, and `SERIALIZABLE`
differ in terms of snapshots, and detect / provoke a serialization
failure.

## Contracts

- **Contract 2** — every tuple has `(xmin, xmax, infomask, hoff)`.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/16-mvcc-and-isolation/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 16.1 | Snapshot levels          | PostgreSQL has 3 (READ UNCOMMITTED is READ COMMITTED) |
| 16.2 | Tuple visibility         | `xmin`, `xmax`, `t_infomask` |
| 16.3 | READ COMMITTED re-read    | Each statement gets a fresh snapshot |
| 16.4 | REPEATABLE READ          | One snapshot per transaction |
| 16.5 | SERIALIZABLE             | SSI; can abort with SQLSTATE 40001 |
| 16.6 | HOT updates              | Same page, no indexed column changes |
| 16.7 | `pageinspect`            | See the heap pages |

## Mental model

- The visibility rule is **per-tuple** based on `(xmin, xmax, snapshot)`.
- A tuple is visible iff: `xmin` committed, `xmin not aborted`, `xmax`
  *not* committed-or-still-running, and `xmin` not in `snapshot.active_xip[]`.
- HEAP_XMIN_FROZEN short-circuits to "visible to all".
- READ COMMITTED sees data as of each statement; REPEATABLE READ as of the
  first statement; SERIALIZABLE adds aborts on conflicting write patterns.

## The five isolation anomalies to recognise

| Anomaly | Two transactions demonstrate | PG default |
|---------|------------------------------|------------|
| Dirty read             | Reads uncommitted data | not possible |
| Non-repeatable read   | Re-read changes        | possible in READ COMMITTED |
| Phantom               | WHERE clause sees new row| possible in READ COMMITTED |
| Write skew            | Two sessions each avoid a constraint | possible in REPEATABLE READ, prevented by SERIALIZABLE |
| Lost update           | Two sessions blindly do `n = n - 1` | possible in any level, must use `FOR UPDATE` or atomic update |

## Exercises

See `exercises/16-mvcc-and-isolation.sql`.
