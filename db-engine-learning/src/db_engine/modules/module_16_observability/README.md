# Module 16 — Observability

## What you'll learn

A database you cannot observe is a database you cannot debug. Three
tools every engine exposes:

- **EXPLAIN** — describe the plan.
- **EXPLAIN ANALYZE** — describe + measure per stage.
- **Replay log** — record inputs and replay deterministically.

After this chapter you can:

- print a plan as a tree;
- record `rows_in/rows_out/time` per operator;
- build a fixture that re-drives a query and gets the same answer
  byte-for-byte.

## Files

```
module_16_observability/
  __init__.py     # everything
```

## Tests

```
tests/modules/test_module_16_observability.py
```

1. `explain(scan)` produces a one-line description.
2. `OpProfiler.__exit__` records the elapsed time.
3. `ReplayLog.to_json()` round-trips through `json.loads`.
