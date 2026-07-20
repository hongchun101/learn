# Module 01 — Storage engine

## What you'll learn

A storage engine turns "give me this row" into "read this byte".
Everything above this layer — WAL, MVCC, parser, planner, executor —
sits on the *abstraction* this layer provides.

By the end of this chapter you can:

- explain the **slotted-page** layout, draw it, and explain why row
  deletion is lazy;
- implement a **B+Tree** with split, range scan, and an inner
  promotion rule that the curriculum tests will exercise;
- explain the **LSM** tradeoff: append-only writes vs. read
  amplification, and why production engines pick LSM for write-heavy
  workloads;
- compare **B+Tree** vs **LSM** and explain the choice in any
  system design interview (hint: random-writes → LSM; range-heavy
  point reads → B+Tree);
- write a tiny **Storage** that satisfies the shared contract
  (`put / get / delete / scan / sync / close`).

## Files

```
module_01_storage/
  slotted.py     # SlottedPage layout, encode_row, decode_row, checksum
  btree.py       # B+Tree with split; inner-node promotion
  sstable.py     # SSTable: sorted run + sparse index + bloom filter
  memtable.py    # MemTable: in-memory write buffer with tombstones
  lsm.py         # LSMTree: orchestrator for memtable + runs + compaction
  inmem.py       # RowStore: minimal Storage used by tests
  chapter.py     # the chapter narrative + run_demo()
```

## How to run

```python
from db_engine.modules.module_01_storage.chapter import run_demo
print(run_demo())
```

Or directly:

```bash
python -m db_engine.modules.module_01_storage.chapter
```

## Tests

```
tests/modules/test_module_01_storage.py
```

Asserts:

1. `SlottedPage` encodes / decodes rows, handles deletes.
2. `BPlusTree` keeps order under 100 random inserts.
3. `SSTable.get` returns the right value or None; bloom rejects
   absent keys without scanning.
4. `LSMTree` end-to-end: put → get → delete → scan; flush triggers
   on overflow; compaction produces a single run.
5. `RowStore` honours the Storage contract.

## Common mistakes

- Forget to write the header after an edit — the page is left
  with stale metadata. Our `_write_header_locked` makes the
  bug atomic; without it, real engines lose data.
- Use `bisect` semantics that rely on Python's `<` — works for
  int/str, breaks for bytes vs str. We always compare bytes.
- In LSM, do *not* return the memtable's tombstone by mistake — a
  deletion must look like "key absent", not "key = None".

## What an expert can do after this module

- [ ] Draw a slotted page from memory; explain the header fields.
- [ ] Write a B+Tree from scratch on a whiteboard.
- [ ] Defend the choice between B+Tree and LSM given a workload.
- [ ] Diagnose "write stall" and "read amplification" in an LSM
      and know which knob to turn first.
- [ ] Explain why every modern HTAP engine has *both*.

## Going deeper

- See `docs/02-glossary.md` for the terms in this chapter.
- See `tests/contracts/test_storage.py` for the cross-module
  contract that later chapters reuse.
