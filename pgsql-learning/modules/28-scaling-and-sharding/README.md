# 28 — Scaling and Sharding

## Goal

You can pick the right scaling strategy for a workload, design a
read-write split, set up FDW sharding, and explain why sharding is
the most expensive choice.

## Contracts

- **Contract 5 (re-check)** — `pg_stat_statements` is your friend
  at scale: shows you which queries actually matter.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/28-scaling-and-sharding/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 28.1 | FDW setup | `postgres_fdw`, server, user mapping |
| 28.2 | Foreign table | Map a remote table locally |
| 28.3 | Push-down | WHERE clause shipped to remote |
| 28.4 | Coordinator pattern | Each shard is a foreign table |
| 28.5 | Read/write split | App routes writes to primary, reads to replicas |
| 28.6 | pg_stat_statements | Top queries, candidate for the replica |
| 28.7 | pg_stat_replication | Replica health |
| 28.8 | Decision matrix | Vertical first, then replicas, then partitioning, then sharding |
| 28.9 | Citus | Multi-shard extension (not bundled) |

## Decision matrix

| Goal | Cheapest path |
|------|---------------|
| Read-heavy OLTP, sub-100 ms queries | 1 primary + N replicas; pgBouncer transaction pooling |
| Workload fits 1 TB | A single big box with PG 16 + 32 cores + 256 GB RAM |
| Workload exceeds 5 TB | Partitioning (RANGE) + replicas; archive old |
| Multi-region or 100 TB+ | Citus; foreign shards; or move to a distributed store |
| Analytics | Use a read replica + `auto_explain`; consider materialized views |

## The cost of sharding

| Cost | Concrete |
|------|----------|
| Joins | Cross-shard joins are pulled local; O(N) shards = N× network |
| Transactions | Distributed transactions are slow; SSI on Citus has overhead |
| Sequences | Need to be shard-aware (`citus_local_shard_id`) |
| Foreign keys | Across shards: not enforceable |
| Backups | Per-shard base backup |
| Migration | Per-shard `pg_dump` or `pg_basebackup` |

If you can avoid sharding, do. If you cannot, plan for it from
day one.

## When *not* to scale

- When your problem is poor indexing, not volume.
- When your problem is single-node vacuum (tune autovacuum first).
- When your write rate is dominated by UPDATE-by-row (move to
  UPSERT).
- When you have not measured. `pg_stat_statements` is the answer.

## Exercises

See `exercises/28-scaling-and-sharding.sql`.
