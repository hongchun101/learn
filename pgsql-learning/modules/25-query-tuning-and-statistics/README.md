# 25 — Query Tuning and Statistics

## Goal

You can defend every planner choice: stats, cost model, extended stats,
and the difference between "tune the planner" and "tune the data".

## Contracts

- **Contract 1 (re-check).**
- **Contract 5 (re-check).**

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/25-query-tuning-and-statistics/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 25.1 | Cost model knobs | `random_page_cost`, `seq_page_cost`, `effective_cache_size`, `work_mem` |
| 25.2 | SSD-tuned cost | Lower `random_page_cost` to 1.1 |
| 25.3 | Sample data | One million rows |
| 25.4 | Plan before/after an index | See Index Scan appear |
| 25.5 | `STATISTICS n` per column | Higher = denser histogram |
| 25.6 | `n_distinct`, `correlation`, `null_frac` | Read from `pg_stats` |
| 25.7 | Mis-estimation | Skewed column, default stats miss |
| 25.8 | Extended stats | `CREATE STATISTICS ... dependencies` |
| 25.9 | `pg_hint_plan` | External extension for query hints |

## Decision tree for "why is this slow?"

1. Capture the plan: `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)`.
2. Compare estimated to actual rows. Off by 10× → stats are stale.
   `ANALYZE`; rebuild extended stats if multi-column.
3. If the plan is right and still slow, look at `read=...` in BUFFERS.
   Pressure on `shared_buffers` / OS cache → consider
   `effective_cache_size` (hint only) or larger `shared_buffers`.
4. If the wrong plan is chosen, sort orders / join orders look wrong:
   re-ANALYZE, then look at cost GUCs.
5. Still wrong? Create (or drop) a more selective index; sometimes
   partial or covering wins.

## Exercises

See `exercises/25-query-tuning-and-statistics.sql`.
