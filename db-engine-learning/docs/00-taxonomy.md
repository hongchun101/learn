# 00 · Database Engine Taxonomy

The shared mental model used by every chapter in this curriculum. **Read
this once before any chapter; revisit when a new chapter introduces a name
you don't recognise.**

## 1. The standard architecture

Every mainstream relational engine decomposes into the same five layers:

```
        ┌─────────────────────────────────────┐
SQL ──► │  Parser         lexer, AST, parse errors │
        ├─────────────────────────────────────┤
        │  Logical plan   relational algebra nodes │
        ├─────────────────────────────────────┤
        │  Optimizer      rules + cost-based optimizer │
        ├─────────────────────────────────────┤
        │  Executor       operator tree, iterator pull │
        ├─────────────────────────────────────┤
        │  Storage        pages, indexes, WAL, MVCC │
        └─────────────────────────────────────┘
```

A request flows down; rows flow up. The optimizer is the only place
"intent" meets "physical reality" — every other layer is mostly mechanical.

A new chapter enters at exactly one of these five layers. The capstone
wires them all.

## 2. The eight problems

The chapters are organised around these. Every chapter touches the
problem in its title; later chapters touch every prior problem.

1. **Represent** — pages, slotted pages, row IDs, fixed vs variable
   length columns, null bitmap, MVCC version chain.
2. **Persist** — write-ahead log, fsync, group commit, checkpoint, ARIES
   recovery, log sequence numbers.
3. **Isolate** — transaction model (flat or nested), isolation level
   (RC, RR, SI, SSI, serializable), MVCC vs lock-based, write conflict
   detection.
4. **Plan** — parse → AST → logical plan → physical plan → operator tree.
5. **Execute** — volcano (pull per row), vectorized (pull per batch),
   morsel-driven (pull per chunk per worker), compilation (codegen).
6. **Optimize** — predicate pushdown, projection pushdown, join
   reordering, subquery decorrelation, statistics, histograms.
7. **Distribute** — partitioning, replication, 2PC, Paxos, Raft, linearizability,
   eventual consistency.
8. **Observe** — EXPLAIN, EXPLAIN ANALYZE, per-stage metrics, replay log.

## 3. The four guarantees — and the trade between them

Every database has to be *somewhere* on each axis. The choice is the
design.

| Axis | Levels | Example |
|------|--------|---------|
| Consistency | read uncommitted → snapshot → serializable | Postgres default = RC; CockroachDB default = SSI |
| Durability | write-back → WAL → synced WAL | MySQL `innodb_flush_log_at_trx_commit` ∈ {0,1,2} |
| Availability | masters, replicas, leaderless | Spanner = strongly consistent; Cassandra = AP |
| Partition tolerance | single-region, multi-region, geo | All multi-region systems choose CP or AP |

The eight problems above say **how** the engine meets a guarantee; the
four guarantees say **what** it meets.

## 4. The four execution models

| # | Model | Mental picture | Canonical systems |
|---|-------|----------------|-------------------|
| 1 | **Iterator / Volcano** — pull model | `open() / next() / close()` row-by-row | Postgres, MySQL, SQLite, every textbook |
| 2 | **Vectorized / batch** | pull N rows at a time, SIMD-friendly | DuckDB, ClickHouse, MonetDB, Velox |
| 3 | **Compilation / codegen** | compile a query fragment to native code | HyPer, DuckDB recent, Spark Tungsten, Velox |
| 4 | **Morsel-driven parallel** | (2) + workers stealing independent chunks | Umbra, DuckDB, HyPer |

Most production engines use a hybrid: iterator planning, vectorized leaves,
just-in-time for hot expressions. The chapters follow the same arc.

## 5. Storage model taxonomy

| Model | On-disk format | Write cost | Read cost | Examples |
|-------|----------------|------------|-----------|----------|
| Row store (heap) | row-by-row in pages | in-place update + WAL | scan = full | SQLite, MySQL |
| B+Tree clustered | rows ordered by PK in a B+Tree | in-place + WAL | PK lookup = O(log N) | Postgres heap+B+Tree, InnoDB |
| LSM tree | sorted runs + bloom filters | append-only memtable + flush | range scan = merge of runs | RocksDB, Cassandra, DuckDB |
| Columnar | per-column files + zones | append delta + compact | scan one column = cheap | Parquet, ORC, DuckDB storage |
| Hybrid (HNSW, etc.) | specialized | — | — | recent |

The chapters build B+Tree (Ch01), LSM (Ch01), and Columnar (Ch13).

## 6. The four isolation levels — what they actually mean

| Level | Allows | Implementation |
|-------|--------|----------------|
| Read uncommitted | dirty reads | none needed |
| Read committed | non-repeatable reads | per-statement snapshot |
| Repeatable read | phantoms (in MVCC only — lock-based RR sees phantoms too) | per-transaction snapshot |
| Snapshot | write skew, read-only anomaly | MVCC, conflict detection on commit |
| Serializable | nothing | SSI (Serializable Snapshot Isolation) or strict 2PL |

Module 03 implements MVCC with snapshot isolation and adds SSI as an
exercise. Module 06 demonstrates the four anomalies directly.

## 7. The join zoo

Every chapter that executes a join shows all three:

| Join | When it wins | When it loses |
|------|-------------|---------------|
| Nested-loop | tiny outer, indexed inner | both large |
| Hash | equi-join, one side fits in memory | neither fits; range join |
| Sort-merge | both pre-sorted; range joins | small one side, no sort |

Module 07 implements all three and shows why the planner picks them.

## 8. How the modules are organised

```
modules/
  01_storage/      B+Tree + LSM, slot, page, checksum
  02_wal/          ARIES-lite: log records, LSN, REDO, UNDO
  03_mvcc/         snapshot isolation, version chain, GC, write conflict
  04_parser/       lexer, recursive descent, AST
  05_planner/      logical operators, predicate pushdown
  06_executor/     volcano, open/next/close, scans, filters, projections
  07_joins/        NLJ, hash, sort-merge, adaptive
  08_cbo/          stats, histograms, DP join ordering
  09_indexes/      secondary, covering, zone map, bloom
  10_vectorized/   batch operators, Arrow-friendly column buffers
  11_parallel/     exchange, morsel, workers, work stealing
  12_distributed/  2PC, Paxos, Raft, shards, linearizability
  13_columnar/     encodings: RLE, dict, delta, bitset
  14_olap/         star schema, group-by, top-k, HLL, t-digest
  15_codegen/      expression AST → Python bytecode
  16_observability/ EXPLAIN, metrics, replays
  17_wire/         text + binary protocols
  18_capstone/     all wired up + TPC-H-lite
```

Every chapter has the same shape:

```
modules/NN_xxx/
  __init__.py
  chapter.py           the narrative; small; under 200 lines
  storage.py / executor.py / planner.py  the chapter's code
  tests/test_chapter.py
  README.md            the chapter as a paper
```

## 9. The shared contracts

Every chapter depends on (and the capstone composes) these eight:

```
Storage              put/get/put-versioned/delete/get-at-tx
Transaction          begin/commit/abort; visible-map
Snapshot             read-ts; writer-conflict
Parser               parse(sql) → AST
Plan                 optimize(ast, stats) → Operator[]
Executor             open(op); while next(op) not eos: emit row
Stats                histogram(column) → Histogram
Wire                 send_frame(type, payload) → reply_frame
```

The contract files live in `src/db_engine/_contracts/`. A failing contract
test fails the whole build; that is intentional.
