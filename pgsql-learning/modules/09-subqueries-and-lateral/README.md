# 09 — Subqueries and LATERAL

## Goal

You can use subqueries — scalar, correlated, `EXISTS`, `IN`, `ANY`/`ALL`
— and `LATERAL` to express per-row computation cleanly.

## Contracts

- **None.**

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/09-subqueries-and-lateral/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 9.1 | Scalar subquery | Re-evaluated per outer row (correlated) |
| 9.2 | `EXISTS`                | The canonical semi-join |
| 9.3 | `NOT EXISTS`            | The canonical anti-join |
| 9.4 | `IN` with subquery      | Equivalent to `= ANY` |
| 9.5 | FROM-side subquery      | A local view |
| 9.6 | Correlated SELECT-list subquery | Each row fires the subquery |
| 9.7 | `LATERAL`               | The only way to reference outer from FROM |
| 9.8 | `ANY` / `ALL`           | Comparison to subquery rows |
| 9.9 | `LATERAL` + GROUP       | Patterns for "first row per group" |

## Mental model

- A **correlated subquery** depends on the outer row. PostgreSQL may
  inline it; EXPLAIN tells you whether it did.
- `EXISTS` is the only reliable correlated-subquery form for a check
  because the optimizer turns it into a hash semi-join or a nestloop with
  early termination. `IN (SELECT col)` is functionally equivalent for
  non-null columns.
- `NOT EXISTS` is the *anti-join*. `NOT IN` with a nullable subquery
  silently returns no rows.

## Exercises

See `exercises/09-subqueries-and-lateral.sql`.
