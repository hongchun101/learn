# Module 09 — Indexes

## What you'll learn

Indexes are how databases turn "scan the whole table" into "look up
one row". The four index types a working engine needs to know:

- **Secondary index** — a sorted map from `(col_value) → row-position`.
- **Covering index** — index-leaf-only scan; never touches the heap.
- **Zone map** — per-block (min, max, count-null); enables block skip.
- **Bloom filter** — definite-absent / probable-present; saves a trip
  to the storage layer for points not in the set.

After this chapter you can:

- implement each kind of index in 30 lines;
- explain why secondary indexes are slow on heavy writes;
- pick between covering and zone map for an OLAP scan;
- design a bloom filter for a write-heavy point lookup workload.

## Files

```
module_09_indexes/
  secondary.py     # SecondaryIndex
  covering.py      # CoveringIndex
  zonemap.py       # ZoneMapIndex + ZoneMap
  bloom.py         # BloomFilter
  chapter.py
```

## Tests

```
tests/modules/test_module_09_indexes.py
```

1. SecondaryIndex returns all rows that match.
2. CoveringIndex returns (key, extras) pairs.
3. ZoneMapIndex.prune drops disjoint zones.
4. BloomFilter never returns False for an added item; rarely True
   for an absent item.
