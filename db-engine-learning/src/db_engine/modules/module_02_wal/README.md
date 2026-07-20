# Module 02 — Write-ahead log + recovery

## What you'll learn

WAL is the spine of every production database. It is what makes a
crash survivable: the database *promises* durability by ensuring that
every modification has been logged and the log has been fsynced before
the user is told "committed".

By the end of this chapter you can:

- explain the **WAL invariant**: a page is not modified in place before
  its log record is durable;
- read and write an **ARIES-lite** log record (BEGIN, UPDATE, COMMIT,
  ABORT, CHECKPOINT);
- implement a **two-pass recovery**: replay committed txns, ignore
  aborted ones;
- choose between **steal / no-steal** and **force / no-force** policies;
- argue the trade between **write-amplification** (every page write
  must be logged) and **recovery time** (log length determines it).

## Files

```
module_02_wal/
  log_record.py    # fixed-width LogRecord encode/decode
  wal.py           # WriteAheadLog + WALTransaction (Transaction contract)
  recovery.py      # recover(log, storage) — ARIES-lite
  chapter.py       # the demo + run_demo()
```

## How to run

```python
from db_engine.modules.module_02_wal.chapter import run_demo
print(run_demo())
```

## Tests

```
tests/modules/test_module_02_wal.py
```

Asserts:

1. `LogRecord.encode/decode` round-trips UPDATE, BEGIN, COMMIT, ABORT.
2. `WALTransaction` aborts leave no trace after recovery.
3. Recovery replays COMMIT only.
4. `flush()` produces the durable barrier (test surrogate:
   `len(log.sink.getvalue()) > 0` after commit).

## The contract exercise

Implement `force_log_at_commit = False`: do *not* fsync on commit,
hold the buffer, and explain — in a comment — why your engine is
now equivalent to `innodb_flush_log_at_trx_commit = 2`.

## Common mistakes

- Forgetting to **fsync** the COMMIT record → durability failure.
- Replaying UPDATEs *without* checking the txn was committed →
  ghost writes from aborted txns.
- Treating `BytesIO` as durable. Replace with a real file and the
  semantics hold.

## Going deeper

- See ARIES (Mohan et al., 1992) for the full algorithm with LSNs,
  dirty page table, and fuzzy checkpoints.
- See `module_03_mvcc` for how WAL and MVCC combine to form the
  transaction model used by every modern OLTP engine.
