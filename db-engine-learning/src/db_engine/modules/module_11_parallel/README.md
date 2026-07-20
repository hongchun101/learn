# Module 11 — Parallel execution

## What you'll learn

After a single thread is saturated, the next lever is parallelism.
The **morsel-driven** model — chunks of rows, multiple workers,
cooperative scheduling — is the standard in modern engines
(Umbra, DuckDB, HyPer).

After this chapter you can:

- implement an exchange operator that bridges workers;
- defend morsel size as a tuning knob (cache locality vs load
  imbalance);
- spot why `Exchange` is a barrier: correctness for `ORDER BY`
  requires an additional sort downstream;
- explain NUMA-aware scheduling and why it matters at 32+ cores.

## Files

```
module_11_parallel/
  __init__.py  # Exchange, parallel_map, run_demo()
```

## Tests

```
tests/modules/test_module_11_parallel.py
```

1. `parallel_map` preserves input order.
2. `Exchange.send/close/drain` round-trips rows.
3. Workers can race safely — count of produced rows equals count
   of consumed rows.

## Going deeper

- See chapter 12 for distributed (cross-machine) coordination.
