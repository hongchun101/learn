# 06 — Aggregates and Grouping

## Goal

You can reduce millions of rows to a number you can defend, with rollups,
cuboids, ordered aggregates, and per-group filters.

## Contracts

- **None.**

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/06-aggregates-and-grouping/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 6.1 | standard aggregates | `count(*)`, `count(DISTINCT)`, `sum`, `avg`, `percentile_cont/disc` |
| 6.2 | `FILTER` clause        | Per-aggregate filter, no `CASE` |
| 6.3 | ordered-set aggregates | `mode() WITHIN GROUP (...)`, `string_agg(...)`, `percentile_cont(...)` |
| 6.4 | `GROUPING SETS`/`ROLLUP`/`CUBE` | Multi-level totals in one query |
| 6.5 | `HAVING`               | Group predicate |
| 6.6 | Aggregate without `GROUP BY` | One row; `ORDER BY` must reference the aggregate |
| 6.7 | `bool_and`/`bool_or`   | Boolean reductions |
| 6.8 | `array_agg`/`jsonb_agg` | Use `ORDER BY` inside the aggregate |

## Mental model

- A query with `GROUP BY` produces *one row per group*. A query without
  `GROUP BY` and with aggregates produces *one row*.
- `HAVING` is to groups what `WHERE` is to rows: `WHERE` filters rows
  *before* aggregation, `HAVING` filters groups *after*.
- `percentile_cont` interpolates; `percentile_disc` returns an actual
  sample. Use `disc` when "true value at the boundary" matters.
- `ROLLUP / CUBE` are *powerful* but the optimiser can sometimes choose a
  worse plan; check the plan in module 10.

## Exercises

See `exercises/06-aggregates-and-grouping.sql`.
