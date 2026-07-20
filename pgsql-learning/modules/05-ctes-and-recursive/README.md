# 05 — CTEs and Recursive

## Goal

You can flatten or organise any query with CTEs, walk graphs with
recursive CTEs, and detect cycles.

## Contracts

- **None.**

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/05-ctes-and-recursive/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 5.1 | Non-recursive CTE | A named query block. Computed once. |
| 5.2 | Data-modifying CTE | CTE that performs INSERT/UPDATE/DELETE + RETURNING. |
| 5.3 | CTE sharing | A CTE is computed once. Referenced twice ⇒ same data. |
| 5.4 | Recursive CTE | `WITH RECURSIVE base UNION ALL recursive`. |
| 5.5 | Cycle detection | `cycle bool` column + `WHERE NOT cycle`. |
| 5.6 | Recursive CTE + window | Combine to compute rolling totals. |

## Mental model

- A **CTE** is a query optimisation fence in some databases; **not** in
  PostgreSQL. You can rely on PostgreSQL to pull predicates through a CTE.
- A **recursive CTE** is a fixed-point computation. The base case runs
  first; the recursive case is then applied to the previous iteration's
  results until it returns no rows.
- `UNION ALL` keeps duplicates and is faster; `UNION` deduplicates and
  may require more bookkeeping. Prefer `UNION ALL` unless you specifically
  need deduplication.
- A **writable CTE** is committed exactly once; you cannot use it as if
  it were a REFRESH-able view.

## Exercises

See `exercises/05-ctes-and-recursive.sql`.
