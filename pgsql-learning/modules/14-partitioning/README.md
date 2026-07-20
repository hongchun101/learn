# 14 — Partitioning

## Goal

You can choose between RANGE, LIST, and HASH partitioning, manage
partitions, attach/detach, and read `EXPLAIN` to confirm partition
pruning.

## Contracts

- **Contract 3** — `pg_inherits` chain lists parent + children.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/14-partitioning/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 14.1 | `PARTITION BY RANGE` | Default for time/sequence data |
| 14.2 | `PARTITION BY LIST` | Discrete categories |
| 14.3 | `PARTITION BY HASH` | Even distribution without a natural key |
| 14.4 | `DETACH` + `ATTACH` | Move partitions safely |
| 14.5 | `DEFAULT` partition | Catch-all; pricier than named partitions |

## Mental model

- Partitioning *moves* the SQL complexity to the catalog; query complexity
  stays the same. Plan changes are about *which* partitions the planner
  visits, not about the logic.
- A partitioned table **does not have** indexes inherited; you create them
  on each child (or use a one-shot `CREATE INDEX ON parent`, which
  Postgres propagates).
- The PK must include every partition key.
- ATTACH/DETACH is transactional (`ALTER TABLE ... ATTACH PARTITION ...
  CONCURRENTLY` exists but takes `SHARE UPDATE EXCLUSIVE`).

## When to partition (and when not to)

- Partition when a *subset* of your access pattern wants to touch a small
  subset of rows, OR you need cheap retention (DROP PARTITION instead of
  DELETE).
- Don't partition for "performance" alone. The optimizer has to know the
  predicate references the partition key.
- Don't partition when total data fits comfortably in RAM and your access
  pattern is uniform.

## Exercises

See `exercises/14-partitioning.sql`.
