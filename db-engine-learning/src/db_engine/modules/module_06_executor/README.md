# Module 06 — Volcano Executor

## What you'll learn

The executor is what actually produces rows. This module implements
the classical Volcano iterator model: `open() / next() / close()`
row-at-a-time, recursively pulled through the operator tree.

After this chapter you can:

- read any production executor's source code;
- explain why **blocking** operators (Sort, HashAgg) must materialise
  before emitting any row;
- add a new operator type without touching existing ones (the
  `_NODE_REGISTRY` design);
- reason about pipeline breakers, pipelined data flow, and where
  you would add parallelism (chapter 11).

## Files

```
module_06_executor/
  catalog.py       # Catalog + Table
  expressions.py   # eval_expr(Expr, row, schema)
  operators.py     # _Op base + Scan/Filter/Project/Sort/Limit/HashAgg/Insert
  chapter.py       # run_demo()
```

## How to run

```python
from db_engine.modules.module_06_executor.chapter import run_demo
print(run_demo())
```

## Tests

```
tests/modules/test_module_06_executor.py
```

Asserts:

1. `Scans → Filter → Project` returns expected rows.
2. SORT produces rows in the right order.
3. LIMIT truncates correctly.
4. HashAgg groups and counts.
5. INSERT inserts and emits a row with the inserted count.

## What an expert can do after this module

- [ ] Add a new operator kind (e.g. WINDOW) using `register(OpKind.WINDOW)`.
- [ ] Trace a single row through the tree and explain each pull.
- [ ] Refactor Sort to external sort (chapter 11).
- [ ] Replace the executor with vectorized (chapter 10) without
      changing the planner.

## Going deeper

- See chapter 07 for joins.
- See chapter 08 for cost-based reorderings on this same tree.
- See chapter 11 for parallel execution.
