requires_version: ">=20"

# docker/

This stack is the **single source of truth** for the runtime every
module assumes: PostgreSQL 16 with `wal_level=replica`, 512 MB
`shared_buffers`, `auto_explain` armed, all `track_*` collectors on.

## Services

| Service  | Port  | Role |
|----------|-------|------|
| primary  | 5432  | Writes, replication source |
| replica  | 5433  | Streaming hot standby (read-only) |
| pgadmin  | 5050  | UI for browsing (optional; profile `ui`) |

The two containers (`primary`, `replica`) share no storage. Modules
20, 21 treat the replica as a streaming-replication target you can
promote. Modules 26, 27 stress the primary with `pgbench`-style
loads.

## Quick start

```bash
cd pgsql-learning
cp .env.example .env                                # connection defaults

docker compose -f docker/docker-compose.yml up -d    # primary + replica
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning \
    -c "SELECT version()"

# Run a module demo:
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning \
    -f /workspace/modules/01-types-and-tables/demo.sql

# Tear down and start fresh:
docker compose -f docker/docker-compose.yml down -v
```

## Promoting the replica (Module 20)

The replica is configured with `pg_basebackup`-style streaming
replication at startup. To promote it:

```bash
# Inside the replica container:
docker compose -f docker/docker-compose.yml exec replica \
    pg_ctl promote -D /var/lib/postgresql/data
```

Or from inside psql on the replica:

```sql
SELECT pg_promote();
```

After promotion, `pg_is_in_recovery()` returns `f` on the replica.
You can then redirect clients to port 5433.

## Setting up WAL archiving (Module 21)

The primary starts with `archive_mode = off` by default. To enable
archiving on a host directory:

```bash
docker compose -f docker/docker-compose.yml exec primary \
    mkdir -p /var/lib/postgresql/archive
docker compose -f docker/docker-compose.yml exec primary bash -c '
    echo "archive_mode = on" >> /var/lib/postgresql/data/postgresql.conf &&
    echo "archive_command = '\''cp %p /var/lib/postgresql/archive/%f'\''" \
        >> /var/lib/postgresql/data/postgresql.conf &&
    pg_ctl reload -D /var/lib/postgresql/data'
```

Verify:

```bash
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d postgres -c "SELECT * FROM pg_stat_archiver;"
```

## Replica setup drill

`scripts/setup-replica.sh` performs the operations a junior DBA
would do by hand: configure `primary_conninfo`, write
`standby.signal`, restart the replica. Run it once you've read
Module 20.

## Reset between modules

Each `demo.sql` is idempotent — running it twice produces the same
end state. If a module leaves residual state that confuses the next,
you can reset the cluster entirely:

```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d
```

The `down -v` removes the named volumes; `up -d` re-creates them
and re-applies `sql/00-init/00-seed.sql`.

## Resource limits

The primary is configured with:

```
shared_buffers = 512 MB
effective_cache_size = 2 GB
work_mem = 32 MB
maintenance_work_mem = 256 MB
```

These are reasonable defaults for a developer laptop. For
production, scale up. See `docs/06-tuning-cheatsheet.md`.

## Volumes

- `primary_data` — the primary's PGDATA.
- `replica_data` — the replica's PGDATA.
- `../` is mounted read-only at `/workspace/` inside both
  containers, so you can `psql -f /workspace/modules/NN-.../demo.sql`.

## Networking

- `primary` resolves to the primary container.
- `replica` resolves to the replica container.
- From the host, the primary is at `localhost:5432`; the replica at
  `localhost:5433`.

## Image choice

`postgres:16-alpine`. We chose:

- 16 (latest stable at the time of writing).
- alpine (small image, fast startup).
- For a more reproducible build, pin a digest:
  `postgres:16-alpine@sha256:...`.

## If the cluster won't start

```bash
docker compose -f docker/docker-compose.yml logs primary --tail 50
docker compose -f docker/docker-compose.yml logs replica --tail 50
```

Common causes:

- A port conflict on the host. `lsof -i :5432`.
- A stale volume from a previous cluster. `docker volume ls | grep
  pgsql`.
- A bug in the seed. `docker compose down -v && docker compose up -d`.
