# 00 — Overview: The Mental Model

> **Read this once.** Every module uses the vocabulary defined here.

## The five problems

Every module is organised around the same five problems:

| # | Problem | Question |
|---|---------|----------|
| 1 | **Model**    | How do I represent this thing on disk and in the catalog? |
| 2 | **Query**    | How does a SQL string become rows? |
| 3 | **Isolate**  | What does a transaction see, and when does it conflict? |
| 4 | **Persist**  | What gets to disk, in what order, with what guarantee? |
| 5 | **Operate**  | How does the cluster stay up, backed up, and observable? |

The first three are SQL or DDL problems. The fourth is the storage and
recovery stack (MVCC, WAL, vacuum). The fifth is everything that turns a
running PostgreSQL into a *service*.

## The five contracts

| # | Contract | Module | Re-checked in |
|---|----------|--------|---------------|
| 1 | `EXPLAIN (ANALYZE, BUFFERS) <query>` | 10 | 11, 18, 25, 26, 27 |
| 2 | `SELECT ... FROM pg_stat_activity` | 22 | 16, 20, 26 |
| 3 | `SELECT ... FROM pg_class WHERE relkind` | 4, 12 | 11, 14, 17, 19 |
| 4 | `pg_current_wal_lsn()` and `pg_last_wal_replay_lsn()` | 17 | 20, 21 |
| 5 | `pg_stat_statements` row per normalised query | 22 | 25, 28 |

## Vocabulary cheat-sheet

| Term | Meaning |
|------|---------|
| **Heap tuple** | A row in its on-disk form (post-update, pre-vacuum). |
| **MVCC** | Multi-Version Concurrency Control: writers don't block readers; old versions linger in the heap until vacuum. |
| **xmin, xmax** | The IDs of the inserting and (possibly deleting) transaction, written into every tuple header. |
| **Snapshot** | A (xmin_horizon, xmax_horizon, active_xip[]) tuple that defines what a query sees. |
| **LSN** | Log Sequence Number: a 64-bit offset into the WAL stream. |
| **WAL** | Write-Ahead Log: append-only journal of changes; the canonical durability boundary. |
| **Checkpoint** | A point past which the heap is known consistent; checkpoint_completion_target throttles it. |
| **Relation** | Anything with pages in pg_class: tables, indexes, views (kind matters). |
| **Buffer** | An 8 KB page in `shared_buffers`. |
| **TOAST** | The Out-of-line Storage mechanism for fields larger than ~2 KB. |
| **Plan node** | A node in the EXPLAIN tree: Seq Scan, Index Scan, Hash Join, Aggregate, Sort, Gather, ... |
| **Plan operator** | A subclass of plan node with a defined I/O cost model. |

## How to read this repo

```
pgsql-learning/
├─ docker/                       # runtime stack
├─ docs/00-overview.md           # this file
├─ docs/01-architecture.md       # the storage + process model
├─ docs/02-glossary.md           # full glossary
├─ sql/00-init/*.sql             # loaded by docker on first start
├─ sql/contracts/*.sql           # five cross-module contract assertions
├─ modules/NN-name/{demo.sql,exercises.sql,answers.sql,README.md}
├─ exercises/*.sql               # twenty-eight grade-able problems
├─ capstone/                     # full stack under sql/capstone/
├─ scripts/                      # verifiers and helpers
└─ diagrams/*.mmd                # mermaid sources; rendered on the web
```

Every module is a self-contained unit of work. Each module:

1. introduces the contract it implements or depends on,
2. runs the SQL for the new concept with copy-pasteable examples,
3. expects you to answer the exercises in `exercises/` against a clean
   dataset,
4. re-asserts the contract at the end with at least one query that fails
   on a known regression.

## The eight things every PostgreSQL expert must say out loud

If you can answer these in your sleep, you are an expert:

1. What is the visibility rule for `xmin/xmax`?
2. How does the planner choose nested-loop vs hash join?
3. When does an index *not* get used?
4. What does `EXPLAIN ANALYZE` show that `EXPLAIN` does not?
5. What is the difference between a streaming replica and a logical one?
6. When is `pg_basebackup` the right backup, when is `pg_dump`?
7. Why is `autovacuum` not optional?
8. Where does the WAL go on a single-node install, where does it go on a
   cluster with a hot standby, and where does it go when `archive_mode=on`?
