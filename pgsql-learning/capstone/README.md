# Capstone — Small but Real

A minimal e-commerce data layer that **exercises every module**:

- schema with partitioning (M14)
- generated identity PK + citext (M01, M04)
- FKs across partitioned tables (M04)
- triggers + `pg_notify` (M13)
- RLS policies via `current_setting` (M23)
- per-user spend running totals, top-N per region, GMV (M07)
- monthly GMV / AOV / rating queries (M06, M07)
- pgvector optional: similarity on review text (M24)
- operational checks: pg_stat_replication, vacuum, pg_stat_statements, locks, slots (M22)

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/capstone/sql/01-schema.sql

docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/capstone/sql/02-functions-triggers-rls.sql

docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/capstone/sql/03-seed.sql

docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/capstone/sql/04-queries.sql

docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/capstone/sql/05-ops.sql
```

The verifier script `scripts/verify-capstone.sh` runs the same SQL, then
checks a few invariants (partitions exist, indexes present, EXPLAIN uses
Index Scan, RLS denies without a token).
