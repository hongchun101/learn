# Module 08 — Cost-based optimizer

## What you'll learn

A rule-based planner (chapter 05) does what it can with structural
rewrites; the moment a query has more than two joins, you need a
cost-based optimizer. The CBO estimates work for each candidate
plan and picks the cheapest.

After this chapter you can:

- compute cardinalities and distinct counts from samples;
- estimate selectivity for `col = c` and `col < c`;
- explain Selinger's dynamic-programming algorithm for join
  ordering;
- defend a greedy or randomized alternative for 10+ joins;
- state why a small constant error in cardinality is enough to
  pick the wrong plan.

## Files

```
module_08_cbo/
  stats.py         # TableStats, ColumnStats, ScanStats
  histogram.py     # EqualHeightHistogram
  cost.py          # CostModel
  dp_ordering.py   # Selinger's DP via bitmask
  chapter.py
```

## How to run

```python
from db_engine.modules.module_08_cbo.chapter import run_demo
```

## Tests

```
tests/modules/test_module_08_cbo.py
```

1. `EqualHeightHistogram.estimate_lt` is monotone.
2. `enumerate_join_orders(["a","b","c"], edges, sizes)` picks
   the cheapest first.
3. `TableStats.from_table` produces correct distinct for
   uniform data.

## Going deeper

- See chapter 09 for indexes that change the cost model.
- See chapter 14 for sketches that give inexpensive
  distinct-count estimates.
