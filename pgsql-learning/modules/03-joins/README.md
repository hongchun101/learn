# 03 — Joins

## Goal

You can combine two or more tables in every supported shape, including
the **LATERAL** join (the only join that can reference the outer query).

## Contracts

- **None.**

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/03-joins/demo.sql
```

## Concepts

| Section | Concept | Result |
|---------|---------|--------|
| 3.1 | INNER JOIN | Only rows with a match on both sides. |
| 3.2 | LEFT JOIN + null filter | The anti-join pattern: rows with no match. |
| 3.3 | FULL OUTER JOIN | Rows from either side; NULLs fill gaps. |
| 3.4 | CROSS JOIN | Cartesian product; rarely the right tool. |
| 3.5 | LATERAL | Per-row correlated FROM-side subquery. |
| 3.6 | Self-join | LATERAL `previous-row`-style pattern. |
| 3.7 | `USING` vs `ON` | Collapses duplicate columns or keeps them. |

## Mental model

- The five join shapes are **plan-time choices**: the planner may convert
  an OUTER JOIN into a UNION ALL or anti-join, but only if it's
  provably equivalent.
- LATERAL is the *only* construct that lets a FROM-side subquery reference
  columns of preceding FROM items.
- `ON` keeps two columns (with possibly different names). `USING (c)`
  collapses them into one and produces a single output column.

## Exercises

See `exercises/03-joins.sql`.
