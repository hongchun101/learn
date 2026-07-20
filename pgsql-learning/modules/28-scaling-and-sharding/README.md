# 28 — Scaling and Sharding

## Goal

You can pick the right scaling strategy for a workload, design a
read-write split, and explain why sharding is the most expensive choice.

## Contracts

- **Contract 5 (re-check)** — `pg_stat_statements` is your friend at
  scale: shows you which queries actually matter.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/28-scaling-and-sharding/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 28.1 | Read replicas | Scale reads; writes still serialised |
| 28.2 | Vertical first | Box size matters; DO IT before sharding |
| 28.3 | Connection routing | Application-side "primary for tx that wrote" |
| 28.4 | FDW as coordinator | Each shard is a Postgres FDW server |
| 28.5 | Read/write split | HikariCP-style |
| 28.6 | Citus | Multi-shard extension |

## Decision matrix

| Goal | Cheapest path |
|------|---------------|
| Read-heavy OLTP | 1 primary + N replicas; pgBouncer transaction pooling |
| Workload fits 1 TB | A single big box with PG 16 + 32 cores + 256 GB RAM |
| Workload exceeds 5 TB | Partitioning (RANGE) + replicas; archive old |
| Multi-region or 100 TB+ | Citus; foreign shards; or move to a distributed store |
| Analytics | Use a read replica + `auto_explain`; consider materialized views |

## When *not* to scale

- When your problem is poor indexing, not volume.
- When your problem is single-node vacuum (tune autovacuum first).
- When your write rate is dominated by UPDATE-by-row (move to UPSERT).

## Exercises

See `exercises/28-scaling-and-sharding.sql`.
