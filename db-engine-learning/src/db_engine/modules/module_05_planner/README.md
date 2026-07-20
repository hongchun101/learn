# Module 05 — Logical Planner

## What you'll learn

The planner converts an AST into a tree of physical operators. It's
where the database starts deciding *how* to answer the question,
not just *what* the question is.

By the end of this chapter you can:

- map every AST node to an operator;
- explain where blocking operators (Sort, HashAgg) must live in a
  tree and why pushing a Filter past a Sort is safe;
- list the three "always-have" rules of any optimizer:
  predicate pushdown, projection pushdown, predicate simplification;
- defend the choice of a *rule-based* planner for small engines
  and explain why every production engine adds a CBO on top.

## Files

```
module_05_planner/
  planner.py     # AST → operator tree
  rules.py       # three classic optimizer rules
  chapter.py     # the demo
```

## How to run

```python
from db_engine.modules.module_05_planner.chapter import run_demo
```

## Tests

```
tests/modules/test_module_05_planner.py
```

Asserts:

1. `SELECT a FROM t WHERE b = 1` ⇒ Scan → Filter → Project tree.
2. `INSERT INTO t VALUES (...)` ⇒ INSERT op.
3. `CREATE TABLE t (a INT, b TEXT)` ⇒ CREATE_TABLE op.
4. `simplify_predicate` drops `WHERE 1=1` and `WHERE a=a`.
5. Pushdown is a no-op for an already-optimal plan.

## Going deeper

- See chapter 08 for cost-based reordering.
- See chapter 11 for parallel-exchange operator insertion.
