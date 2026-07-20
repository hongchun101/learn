# 15 — FDW and dblink

## Goal

You can read CSVs with `file_fdw`, declare a `postgres_fdw` server,
describe a foreign table, push joins to a remote node, and fall back to
`dblink` when an FDW is overkill.

## Contracts

- `pg_foreign_server` lists remote servers.
- `pg_user_mapping` lists credentials per server.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/15-fdw-and-dblink/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 15.1 | `file_fdw` | Read external CSV without copying |
| 15.2 | `postgres_fdw` server | Declare a remote PG, user mapping, foreign table |
| 15.3 | `dblink()` | One-shot remote query; returns `record` |
| 15.4 | Push-down | Use `cost_remote_*` to influence planner |

## Mental model

- `file_fdw` reads each row from disk at every query. It's fine for a
  small lookup table, painful for a 50 GB CSV.
- `postgres_fdw` is the recommended way to talk to another PostgreSQL.
  The planner can push filters and joins to the remote side; GUCs like
  `enable_partitionwise_join` and `from_collapse_limit` control that.
- `dblink` is **not** a connection pooler; it opens a fresh connection
  per invocation. Don't put it in a hot path.

## Exercises

See `exercises/15-fdw-and-dblink.sql`.
