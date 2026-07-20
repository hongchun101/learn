# Module 10 — Vectorized execution

## What you'll learn

Volcano's per-row pull is simple but spams the call stack and
makes branch prediction miserable. Modern engines (DuckDB,
ClickHouse, Velox) work in **batches** of 1024–65536 rows at a
time: one virtual-function call amortised across thousands of
rows, with conditional-move instead of branch-based filter
selection.

After this chapter you can:

- argue why batch execution wins on modern CPUs (cache locality,
  fewer pipeline flushes);
- explain the role of `selection vectors` — a vector of *kept*
  indices rather than a copy of the row data;
- spot the path from a batch-execution engine to a SIMD-friendly
  one (`array.array`, `numpy`, native).

## Files

```
module_10_vectorized/
  __init__.py  # Batch, vectorized_filter, vectorized_project, run_demo()
```

## Tests

```
tests/modules/test_module_10_vectorized.py
```

Asserts that `vectorized_filter` matches the per-row reference and
that batches preserve input order.

## Going deeper

- See chapter 15 for compilation (turns the loop body into byte-
  code or native code).
- See chapter 13 for columnar batches from on-disk files.
