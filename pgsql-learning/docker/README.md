requires_version: ">=20"

# docker/

This stack is the **single source of truth** for the runtime every module
assumes: PostgreSQL 16 with `wal_level=replica`, 512 MB `shared_buffers`,
`auto_explain` armed, all `track_*` collectors on.

```
docker compose -f docker/docker-compose.yml up -d          # start primary + replica
docker compose -f docker/docker-compose.yml --profile ui up -d  # also pgAdmin
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning
docker compose -f docker/docker-compose.yml down -v       # nuke and reinit
```

The two containers (`primary`, `replica`) share no storage. Modules 20, 21
treat the replica as a streaming-replication target you can promote. Modules
26, 27 stress the primary with `pgbench`-style loads.
