# 10 — EXPLAIN and ANALYZE

## Goal

You can read an EXPLAIN plan and immediately tell whether the planner
chose well, what was misestimated, and where to add an index.

## Contracts

- **Contract 1** — `EXPLAIN (ANALYZE, BUFFERS) <query>` returns a plan
  tree. We exercise it here and re-check it in modules 11, 18, 25, 26, 27.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/10-explain-and-analyze/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 10.1 | `EXPLAIN` (no analysis) | Cost estimates only; no execution |
| 10.2 | `EXPLAIN ANALYZE` | Runs the query; reports row counts and actual time |
| 10.3 | Aggregation plan | HashAggregate + Sort |
| 10.4 | Hash Join / Nested Loop | Compare planner choices |
| 10.5 | Mis-estimation | Skewed column, default stats fail |
| 10.6 | `FORMAT JSON` | Machine-readable; `auto_explain` uses it |

## How to read a plan

```
Limit  (cost=XX..YY rows=ZZ) (actual rows=W time=...ms)
  ->  Sort  (cost=... rows=ZZ) (actual rows=W time=...)
        Sort Key: ...
        ->  Hash Join  (cost=... rows=ZZ) (actual rows=W time=...)
              Hash Cond: (...)
              ->  Seq Scan on t  (cost=...)
              ->  Hash  (cost=...)
                    ->  Seq Scan on u  (...)
```

The four things to read for each node:

1. **Estimated rows vs actual rows** — off by 10× or more = bad stats.
2. **Node type and order** — outer node is the one closest to the result;
   leaves are the scans.
3. **`Buffers: shared hit=N read=M`** — `M > 0` = disk read; if you see
   `read=...` and `local=...`, you know your `shared_buffers` are too small
   for the data set.
4. **`Execution Time`** — the headline number.

## Mental model

- Cost numbers are **not milliseconds**. They are *fractions* of the cost
  of a single sequential page read (`seq_page_cost = 1.0` by default).
- `actual time=...` **is** milliseconds (`time is in ms`).
- A Seq Scan is not always bad. With a 100-row table, an Index Scan costs
  more than a Seq Scan.
- An Index-Only Scan (IOS) requires the visibility map to be set; we will
  revisit this in module 19.

## Exercises

See `exercises/10-explain-and-analyze.sql`.
