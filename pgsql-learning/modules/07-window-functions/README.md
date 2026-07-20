# 07 — Window Functions

## Goal

You can compute running totals, ranks, lag/lead, frames, and named
windows on any ordered or partitioned stream.

## Contracts

- **None.**

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/07-window-functions/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 7.1 | `row_number` / `rank` / `dense_rank` | Three different "ranks" |
| 7.2 | `first_value` / `last_value` | Frame-end positions matter |
| 7.3 | Running sum with `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` | Default row-mode frame |
| 7.4 | Sliding window | `ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING` |
| 7.5 | `WINDOW` clause                | Named windows; combine many in one query |
| 7.6 | `ntile` / `percent_rank` / `cume_dist` | Distributional aggregates |
| 7.7 | `lag` / `lead`                  | Offset within partition |
| 7.8 | `EXCLUDE CURRENT ROW` (PG ≥ 14) | Frame exclusion |

## Mental model

- The default frame depends on the presence of an ORDER BY inside OVER:
  - No ORDER BY → entire partition (`RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`)
  - With ORDER BY → `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`
- `ROWS` is by row position; `RANGE` is by value (peer rows share boundaries).
- `first_value()` requires you to set the frame to UNBOUNDED FOLLOWING if
  you want a "real" first value; otherwise it equals "earliest in default
  frame" (i.e. self on an `ORDER BY x`).
- `WINDOW w AS (...)` defines a window specification by name — combine it
  across many aggregates to keep the query DRY.

## Exercises

See `exercises/07-window-functions.sql`.
