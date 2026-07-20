# 20 — Replication and HA

## Goal

You can set up streaming replication, decide between physical and logical
replication, ship a switchover playbook, and read `pg_stat_replication`
fluently.

## Contracts

- **Contract 4 (re-check on replica).**

## Run

```bash
bash modules/20-replication-and-ha/scripts/setup-replica.sh
bash modules/20-replication-and-ha/scripts/promote-replica.sh
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/20-replication-and-ha/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 20.1 | Streaming / physical | Per-block, byte-level, fast on same datacenter |
| 20.2 | Replication slots   | Server-side cursor of how far the replica has WAL'd |
| 20.3 | Logical             | Row-based; cross-version, partial, multi-publisher |
| 20.4 | Subscriptions       | Subscriber reads from one or more publications |
| 20.5 | Switchover playbook | Quiesce, wait, promote, redirect clients |
| 20.6 | Replication lag     | `now() - pg_last_xact_replay_timestamp()` |

## Mental model

- **Physical** replication copies WAL bytes; same major version; standby
  has no opinions.
- **Logical** replication decodes WAL into row changes; allows schema
  transforms and version upgrades.
- **Replication slots** are critical for *guaranteed* publishing — they
  prevent WAL from being recycled before all subscribers have it.
  Runaway slots are a common outage cause (we will check this in 22).

## Switchover playbook (memorise it)

1. Stop writes on the primary: `pg_ctl pause` or drain the load balancer.
2. Wait until `pg_last_wal_replay_lsn()` on the replica catches up.
3. Run `SELECT pg_promote();` on the replica.
4. Update your connection pooler / DNS / service discovery.
5. (Optional) Re-purpose the old primary as a new replica.

## Exercises

See `exercises/20-replication-and-ha.sql`.
