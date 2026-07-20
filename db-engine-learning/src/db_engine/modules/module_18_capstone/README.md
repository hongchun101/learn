# Module 18 — Capstone

## What you'll learn

This chapter is the smoke test of the whole curriculum. It runs
eight canonical queries end-to-end through:

  - the catalog (06)
  - the parser (04)
  - the planner (05)
  - the executor (06)
  - the wire protocol (17)

If it works, you've wired the engine together. If any chapter is
broken, the capstone fails.

## The eight queries

| # | Query              | Demonstrates                   |
|---|--------------------|--------------------------------|
| 1 | COUNT(orders)      | aggregation over a table       |
| 2 | COUNT(lineitem)    | aggregation over a wider table |
| 3 | MIN(l_extendedprice) | min aggregate                |
| 4 | AVG(l_extendedprice) | avg aggregate                |
| 5 | filter orders by price | selection                  |
| 6 | SUM with filter    | sum with predicate             |
| 7 | filter customers   | selection on another table     |
| 8 | equality filter    | equality filter                |

## Files

```
module_18_capstone/
  __init__.py     # build_tpch_lite, run_q, run_capstone, run_wire_demo
```

## Run

```bash
python scripts/run_capstone.py
```

## Going forward

After this chapter you can read the Postgres source, the DuckDB
source, and ClickHouse in any part — they're combinations of the
ideas in modules 01–17, often with one or two twists the
curriculum did not cover.
