# Module 14 — OLAP queries + sketches

## What you'll learn

OLAP queries scan a lot; we want to *summarise* fast. Sketches let
us answer questions approximately with bounded memory, sometimes
faster than the exact answer.

After this chapter you can:

- implement group-by aggregation over columnar data;
- compute exact and approximate top-k;
- implement **HyperLogLog** for distinct counts (~1.5% error,
  16 KB memory);
- implement **t-digest** for mergeable quantiles.

## Files

```
module_14_olap/
  __init__.py     # everything
```

## Tests

```
tests/modules/test_module_14_olap.py
```

1. `groupby_aggregate` correctly sums per group.
2. `topk` orders by frequency.
3. `HyperLogLog.count()` for 10 K unique values is within ±5%.
4. `TDigest.quantile(0.5)` for uniform input is within ±5% of
   the true median.
