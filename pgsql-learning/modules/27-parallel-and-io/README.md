# 27 — Parallel and I/O

## Goal

You can read parallel GUCs, force (or deny) parallelism per-query,
prewarm the cache, and tune I/O concurrency.

## Contracts

- **Contract 1 (re-check)** — see parallel plans in EXPLAIN.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/27-parallel-and-io/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 27.1 | Parallel GUCs | workers, costs, sizes |
| 27.2 | `SET LOCAL parallel_tuple_cost` | Force parallelism on a query |
| 27.3 | Parallel index build | `max_parallel_maintenance_workers` |
| 27.4 | `pg_prewarm` | Reload table into shared_buffers |
| 27.5 | `effective_io_concurrency` | Hint to planner |
| 27.6 | Watch workers | `pg_stat_activity` shows worker pids |

## Mental model

- Parallel plans are: Parallel Seq Scan, Parallel Index (Only) Scan,
  Parallel Bitmap Heap Scan, Parallel Hash Join (PG 11+), Parallel
  Append, Parallel Gather / Gather Merge.
- Postgres serialises many operations; `count(DISTINCT)` and
  `HAVING`/aggregate-with-correlated-predicates often cannot parallelise.
- `effective_io_concurrency` is a *hint* about how well the OS can merge
  pending reads. With modern NVMe on Linux it's not unusual to leave the
  default alone.
- pg_prewarm is your tool for the post-restart cold-cache cliff.

## Exercises

See `exercises/27-parallel-and-io.sql`.
