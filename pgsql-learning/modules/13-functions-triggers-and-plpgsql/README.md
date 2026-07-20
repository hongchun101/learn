# 13 — Functions, Triggers, PL/pgSQL

## Goal

You can write SQL or PL/pgSQL functions, attach row-level and
statement-level triggers, mark functions `IMMUTABLE/STABLE/VOLATILE`,
and ship `SECURITY DEFINER` helpers safely.

## Contracts

- **Contract 3** — `pg_proc` lists every function.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/13-functions-triggers-and-plpgsql/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 13.1 | SQL function | `LANGUAGE SQL` |
| 13.2 | PL/pgSQL with `EXCEPTION` | `RAISE`, `EXCEPTION WHEN` |
| 13.3 | row-level trigger (BEFORE/AFTER, INSERT/UPDATE/DELETE) | `TG_OP`, `NEW`, `OLD` |
| 13.4 | STORED GENERATED vs trigger | Prefer STORED when the formula is pure |
| 13.5 | `SECURITY DEFINER` | Run with owner privileges; `SECURITY INVOKER` is default |
| 13.6 | `IMMUTABLE/STABLE/VOLATILE` | Affects inlining + parallelism |
| 13.7 | `RETURNS TABLE` + `OUT` params | Multi-value return |
| 13.8 | `pg_notify` from a trigger | Pub/sub |

## Mental model

- Choose `LANGUAGE SQL` for query-shaped logic — the planner can inline it.
- Use `PL/pgSQL` only when you need control flow or `EXCEPTION` blocks.
- Mark `IMMUTABLE` aggressively if it's true. A wrong mark yields wrong
  answers; an under-marked function just gets planned conservatively.
- `SECURITY DEFINER` is a footgun: explicitly `SET search_path = ''` in
  the function and qualify every table to avoid installing a search-path
  exploit.
- A trigger runs as part of the writing transaction. Errors abort the
  statement.

## Exercises

See `exercises/13-functions-triggers-and-plpgsql.sql`.
