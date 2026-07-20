# Module 03 — MVCC + Snapshot Isolation

## What you'll learn

Multi-Version Concurrency Control (MVCC) is the model used by
Postgres, MySQL/InnoDB, Oracle, CockroachDB, TiDB, Spanner (with
twists), and every modern HTAP engine. It avoids read-write blocking
by giving readers a snapshot at their start time; writers append
new versions without touching existing ones.

By the end of this chapter you can:

- explain **timestamp ordering** for visibility;
- implement **write-write conflict** detection at commit time;
- demonstrate **write skew** (lost update, phantom-style anomalies
  that snapshot isolation *permits*);
- detect serializability violations with **SSI** (the structure
  cockroach uses);
- garbage-collect old versions using a **read horizon**.

## Files

```
module_03_mvcc/
  snapshot.py       # MVTransaction + MultiVersionStore
  version_chain.py  # Version dataclass (re-exported)
  ssi.py            # SerializabilityTracker
  chapter.py        # the narrative + run_demo()
```

## How to run

```python
from db_engine.modules.module_03_mvcc.chapter import run_demo
print(run_demo())
```

## Tests

```
tests/modules/test_module_03_mvcc.py
```

Asserts:

1. T1 commits at ts=1; T2 starts at ts=2 and writes; a third txn at
   ts=3 must see T2's write, not T1's.
2. A reader at ts=1 must see the value that was current at ts=1,
   even if later txns overwrote it.
3. An aborted write is invisible to future txns.
4. Two txns writing the same key produce a write-write conflict
   on the second commit.
5. SSI aborts the textbook write-skew pattern.

## What an expert can do after this module

- [ ] State the four isolation levels and what each one permits.
- [ ] Reason about *why* write skew is invisible to snapshot isolation.
- [ ] Walk through how Postgres detects it (rw conflict + ww conflict).
- [ ] Explain why MVCC needs GC, and which horizon to use.
- [ ] Decide between pessimistic and optimistic for a new workload.

## Going deeper

- See chapter 12 for distributed MVCC.
- See chapter 09 for index visibility under MVCC.
- See chapter 18 for the capstone that wires MVCC into everything.
