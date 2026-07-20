# Module 07 — Joins

## What you'll learn

A join takes rows from two inputs and emits a row for each pair that
the predicate accepts. There are three textbook algorithms:

| Algorithm        | Build | Probe | When it wins                         |
|------------------|-------|-------|--------------------------------------|
| Nested-loop      | none  | O(NM) | small outer, indexed inner           |
| Hash join        | O(M)  | O(N)  | equi-join, both fit in memory         |
| Sort-merge       | O(M log M + N log N) | equi-join, range joins |

After this chapter you can:

- implement all three algorithms;
- state which one the planner should pick for a given pair of
  inputs;
- diagnose why the textbook complexity hides the constants
  (cache locality, hashing cost, comparing cost).

## Files

```
module_07_joins/
  operators.py    # _NLJoin, _HashJoin, _SortMergeJoinOp
  chapter.py
```

## How to run

```python
from db_engine.modules.module_07_joins.chapter import run_demo
```

## Tests

```
tests/modules/test_module_07_joins.py
```

Asserts:

1. NL join produces the same answer as hash join on the same data.
2. Hash join handles outer with NULL key (skip).
3. Sort-merge preserves sort order; ties produce a Cartesian-like
   product.

## Going deeper

- See chapter 08 for the cost model that picks among them.
- See chapter 10 for vectorized hash join.
- See chapter 13 for hash join on columnar data.
