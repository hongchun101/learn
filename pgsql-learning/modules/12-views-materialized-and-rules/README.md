# 12 — Views, Materialized Views, Rules

## Goal

You can layer queries with views, refresh materialized views on a
schedule or incrementally, and know when a rule is the right tool (almost
never — they exist for compatibility and partitioning).

## Contracts

- **Contract 3** — `pg_class.relkind = 'v'|'m'|'r'`.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/12-views-materialized-and-rules/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 12.1 | plain view | Rewritten in place; planner predicates pushed through |
| 12.2 | updatable view | One underlying table, no aggregates |
| 12.3 | materialized view | Stored; `REFRESH` (lock) or `REFRESH CONCURRENTLY` (no lock, needs UNIQUE) |
| 12.4 | rules | `CREATE RULE ... ON ... DO ...` — pre-planner |
| 12.5 | `WITH CHECK OPTION` | View write must respect the view's predicate |

## Mental model

- A **view** is a query name. It's expanded at parse time; there's no
  materialised state. The planner can push predicates through.
- A **materialized view** has a `pg_class` entry whose `relkind = 'm'`
  and own data pages. `REFRESH` invalidates it entirely.
- **Rules** survive from PostgreSQL's pre-trigger era. They expand SQL
  before the planner; use triggers for anything that fires on writes.
- `WITH CHECK OPTION` is the cheapest "view as a guardrail" you can ship.

## Exercises

See `exercises/12-views-materialized-and-rules.sql`.
