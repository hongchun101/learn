# Module 13 — Columnar storage + encoding

## What you'll learn

OLAP engines read whole columns, not whole rows. The basic encodings:

- **RLE** — runs of the same value collapse to `(value, length)`.
- **Dictionary** — distinct values map to small ints; codes are a
  dense int column.
- **Delta** — for monotone columns, store the deltas.
- **Bitset** — boolean columns fit in 1 bit each.

After this chapter you can:

- pick the right encoding per column;
- argue why the right encoding is the difference between 1 GB/s
  and 10 GB/s scan rates;
- defend a Parquet-style file with `nulls`, `dict-encoded` and
  `delta-encoded` columns at the same time.

## Files

```
module_13_columnar/
  __init__.py     # everything
```

## Tests

```
tests/modules/test_module_13_columnar.py
```

1. `rle_encode/decode` round-trips.
2. `Dictionary` collapses repeated values.
3. `delta_encode/decode` recovers the original monotone series.
4. `bitset_pack` packs booleans densely.
