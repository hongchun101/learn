# 02 — DML and Queries

## Goal

You can write precise INSERT/UPDATE/DELETE/MERGE/RETURNING statements
that are idempotent, atomic, and produce a clear result.

## Contracts

- **None.**

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/02-dml-and-queries/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 2.1 | `INSERT ... ON CONFLICT` | Upsert with `RETURNING` and `xmax` trick to know if it inserted |
| 2.2 | `DISTINCT ON`              | Keep one row per partition key (Postgres-only) |
| 2.3 | `ORDER BY ... NULLS FIRST/LAST` | Stable ordering with NULLs |
| 2.4 | `UPDATE ... FROM`          | Join-driven update |
| 2.5 | `DELETE ... RETURNING`     | Atomic delete + result set |
| 2.6 | `MERGE`                    | Single statement upsert + branching (PG ≥ 15) |
| 2.7 | CTE with `RETURNING`       | Composable DML piped into SELECT |

## Mental model

- `ON CONFLICT (col) DO UPDATE` is a single round-trip upsert. The set you
  compare against is the **conflict target** (a unique index or constraint).
- `MERGE` is **not** an upsert wrapper; it is a full join-driven decision
  tree. Don't try to make it do what `ON CONFLICT` does.
- Use `RETURNING` for any DML whose result feeds downstream code: it's
  race-free and atomic, unlike `SELECT` after `UPDATE`.

## Exercises

See `exercises/02-dml-and-queries.sql`.
