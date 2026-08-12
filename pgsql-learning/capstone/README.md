# Capstone — Small but Real

A minimal e-commerce data layer that **exercises every module**:

- schema with partitioning (M14)
- generated identity PK + citext (M01, M04)
- FKs across partitioned tables (M04)
- triggers + `pg_notify` (M13)
- RLS policies via `current_setting` (M23)
- per-user spend running totals, top-N per region, GMV (M07)
- monthly GMV / AOV / rating queries (M06, M07)
- pgvector semantic search over reviews (M24)
- operational checks: pg_stat_replication, vacuum, pg_stat_statements, locks, slots (M22)
- replication state + switchover playbook (M20)
- backup / restore / PITR workflow (M21)

## SQL files

| File | What it does |
|------|--------------|
| `01-schema.sql` | `shop.users`, `shop.products`, partitioned `shop.orders`, `shop.order_items`, `shop.reviews` |
| `02-functions-triggers-rls.sql` | audit trigger, `pg_notify` on review insert, RLS policies via session token |
| `03-seed.sql` | deterministic seed: 2 000 users, 1 000 products, 10 000 orders, 5 000 reviews |
| `04-queries.sql` | daily top-5 buyers, top-3 products per region, monthly GMV, AOV, running totals |
| `05-ops.sql` | ops: replication, vacuum, slow queries, locks, slots, wraparound |
| `06-pgvector.sql` | semantic search over reviews via HNSW (no-op if pgvector not installed) |
| `07-rls-tests.sql` | RLS denies without token; introspection of policies |
| `08-ops-deep-dive.sql` | top queries, bloat, unused indexes, replication lag, cost model |

## Run

```bash
# All at once:
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/capstone/sql/01-schema.sql
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/capstone/sql/02-functions-triggers-rls.sql
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/capstone/sql/03-seed.sql
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/capstone/sql/04-queries.sql
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/capstone/sql/05-ops.sql
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/capstone/sql/06-pgvector.sql
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/capstone/sql/07-rls-tests.sql
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/capstone/sql/08-ops-deep-dive.sql

# Or end-to-end:
bash scripts/verify-capstone.sh
```

The verifier script `scripts/verify-capstone.sh` runs the same SQL,
then checks a few invariants:

- 24 partitions of `shop.orders` exist
- `shop.orders`, `shop.reviews` tables exist
- `reviews_notify_trg` trigger exists
- RLS denies without a token (zero rows)
- RLS is enabled on `shop.orders` and `shop.order_items`

## What "small but real" means

This is a real schema. The partition key is `placed_at`. The
indexes cover the most common queries. The RLS policies are
exactly the kind of policies you would write in a real product. The
queries in `04-queries.sql` are the kind of questions a product
manager asks every Monday.

What is *not* real:

- The seed is small (10 000 orders). Production is 10⁹.
- There are no migrations. Production has 200.
- There is no `app_writer` / `app_reader` separation in the
  application. Production has 12 services.
- pgvector is using 8-dim pseudo-embeddings. Production uses 1 536
  from a real model.

The lesson is the *shape*, not the size.

## Reading the EXPLAIN output

`04-queries.sql` runs `EXPLAIN (ANALYZE, BUFFERS)` on the daily
top-5 buyers. After running, look at:

- **Plan shape**: is it `Index Scan using orders_placed_at_idx …`?
  It should be — that index is on the predicate.
- **Estimated rows vs actual**: do they match? If not, the
  partition's stats are stale. Run `ANALYZE shop.orders;`.
- **Buffers**: how many `shared hit` vs `read`? If mostly `read`,
  the working set doesn't fit in `shared_buffers`.

This is exactly the workflow of `docs/04-incident-playbook.md`
Scenario 4.

## Where to go from here

After running the capstone, you should be able to:

1. Read the `EXPLAIN ANALYZE` plan and identify every plan node.
2. Tell whether an index is being used and why.
3. Tell whether statistics are stale.
4. Tell whether the cluster is healthy (replication, vacuum,
   wraparound).
5. Tell whether RLS is doing what you think it does.

If you can't, re-read `docs/00-overview.md` and re-run the
modules from Part 3 onward.
