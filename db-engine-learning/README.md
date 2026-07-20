# Database Engine — A From-0-to-Expert Curriculum

> 18 chapters, one shared core, every chapter is runnable.
> Read this top-to-bottom and you can read and write any production-grade
> relational engine, defend your choices about correctness and performance,
> and teach the rest of your team.

## What this is

A complete, runnable curriculum on **database engine internals**. Every
chapter is a small, tested Python module; every module builds on the prior
ones; chapters 16–18 combine them into a working SQL engine that handles
the seven universal database contracts (see `docs/00-taxonomy.md`).

The goal is not "I can use Postgres" — it's "I can read the Postgres
source, explain MVCC, design a storage layer for a new workload, and defend
a choice between B-Tree and LSM in a system design interview."

## Reading order

```
00  shared taxonomy      ── read first; the mental model
01  Storage engine       ── pages, slotted pages, B+Tree, LSM (SSTable / WISC key)
02  WAL + recovery       ── write-ahead logging, ARIES-lite, REDO/UNDO, checkpoint
03  MVCC                 ── snapshot isolation, garbage collection, write conflicts
04  SQL → AST            ── lexer, recursive-descent parser, AST nodes
05  Logical planner      ── relational algebra, predicates, projections
06  Volcano executor     ── the iterator model every production engine starts from
07  Joins                ── nested-loop, hash join, sort-merge, adaptive
08  Cost model + CBO     ── statistics, histograms, join ordering, DP
09  Indexes              ── secondary, covering, bloom filter, zone map
10  Vectorized execution ── batch-oriented operators, SIMD, Arrow-friendly
11  Parallel execution   ── exchange operator, morsel-driven, NUMA awareness
12  Distributed          ── 2PC, Paxos/Raft, sharding, vector clocks, Raft log
13  Columnar + encoding  ── run-length, dict, delta, bitset, Parquet-style
14  OLAP + aggregation   ── star schema, group-by, top-k, sketch aggregates
15  Query compilation    ── expression trees → Python bytecode codegen
16  Observability        ── EXPLAIN, per-stage metrics, deterministic replay
17  Wire protocol        ── minimalist text protocol + binary frame
18  Capstone             ── wire it all together: TPC-H-lite + REPL
```

After 01–06 you understand every mainstream OLTP engine.
After 07–11 you can read any production optimizer.
After 12 you understand distributed consistency.
After 13–15 you understand why modern engines (DuckDB, ClickHouse, Databricks) are fast.
After 16–18 you can ship a working database.

## The eight universal problems

Chapters are organised around the same eight problems in every module:

1. **Represent** — how do I model a row, a page, a table on disk?
2. **Persist** — what gets to disk, in what order, with what guarantee?
3. **Isolate** — what does a transaction see, and when does it conflict?
4. **Plan** — how does a SQL string become a tree of operators?
5. **Execute** — how does the operator tree pull rows out?
6. **Optimize** — what statistics, what rules, what cost model?
7. **Distribute** — many nodes, one logical database; what fails?
8. **Observe** — EXPLAIN, metrics, replays, deterministic test runs.

## The seven cross-module contracts

Every chapter implements — or depends on — one of these contracts:

| # | Contract | Where it's introduced | Reused in |
|---|----------|-----------------------|-----------|
| 1 | `Storage.put(key, value) / Storage.get(key)` | module 01 | every later module |
| 2 | `Transaction.commit(txn_id) / Transaction.abort(txn_id)` | module 02 | every mutating module |
| 3 | `Snapshot.read(ts) / Snapshot.write_conflict(txn)` | module 03 | modules 06–11 |
| 4 | `Parser.parse(sql) → AST` | module 04 | modules 05–18 |
| 5 | `Plan.optimize(ast, stats) → Operator[]` | modules 05+08 | modules 06–18 |
| 6 | `Executor.next(op) → row \| EOS` | module 06 | modules 07–18 |
| 7 | `Stats.histogram(column)` | module 08 | modules 09, 11, 14 |
| 8 | `Wire.send_frame(type, payload)` | module 17 | module 18 |

The contract files live in `src/db_engine/`. Tests in `tests/` assert the
behavior; each module adds at least one test that exercises the new
contract and one that demonstrates a regression a working engine must
catch (lost write, write skew, bag semantics, hash collision, etc.).

## Quick start

```bash
cd db-engine-learning
python -m pip install -e ".[dev]"
pytest tests/ -v                # ~150 tests, ~5s
python scripts/print_curriculum.py
python scripts/run_capstone.py  # end-to-end TPC-H-lite
```

The local build host has `python` 3.12. Modules 01–11 are pure-stdlib;
modules 12+ may pull in optional libs (`orjson`, `mmap`, `lz4`) but fall
back to stdlib equivalents.

## What an expert can do after this curriculum

| Skill | Where you learn it |
|---|---|
| Read the Postgres / MySQL / SQLite source layout | `docs/00-taxonomy.md`, Ch01–03 |
| Defend a choice between B+Tree and LSM | Ch01, Ch09 |
| Reason about durability vs. latency vs. throughput | Ch02, Ch11 |
| Diagnose write skew, lost update, phantom, serialization failure | Ch03, Ch06, Ch07 |
| Read any `EXPLAIN ANALYZE` plan and tune it | Ch06, Ch07, Ch08 |
| Design an index for an unknown query mix | Ch09 |
| Say why vectorized beats row-wise in OLAP | Ch10, Ch13 |
| Reason about distributed consistency (linearizability, eventual, causal) | Ch12 |
| Build a columnar format with proper encoding | Ch13 |
| Implement sketch aggregates (HLL, t-digest, KLL) | Ch14 |
| Compile a hot expression to bytecode | Ch15 |
| Implement an end-to-end engine with a wire protocol | Ch17, Ch18 |

## Layout

```
db-engine-learning/
├── README.md
├── pyproject.toml
├── docs/
│   ├── 00-taxonomy.md
│   ├── 01-how-to-run.md
│   └── 02-glossary.md
├── src/db_engine/
│   ├── _contracts/      # the eight cross-module contracts
│   ├── shared/          # types: row, page, txn, stats, error, util
│   └── modules/         # one Python package per chapter (01..18)
├── tests/
│   ├── contracts/       # asserts every contract chapter by chapter
│   ├── modules/         # one test file per chapter
│   └── e2e/             # end-to-end + property tests
├── scripts/
│   ├── print_curriculum.py
│   └── run_capstone.py
├── data/                # scratch pad for capstone runs
└── notebooks/           # walkthroughs (optional)
```

## Quality gates

```bash
# Per-module: every chapter has at least one test that fails on a known bug
pytest tests/modules -v

# Per-contract: the eight contracts behave identically across modules
pytest tests/contracts -v

# End-to-end capstone
python scripts/run_capstone.py
# → CAPSTONE OK

# Strict typing across the codebase
mypy --strict src/db_engine
ruff check src tests
```

## Reading this repo

1. Read `docs/00-taxonomy.md` once. It defines the eight problems and the
   vocabulary the rest of the repo uses.
2. Read module 01 end-to-end. Each module is structured the same way; once
   you understand one, you understand all of them.
3. Pick the chapter closest to your work, run its tests, then read its
   parent and child chapters.
4. After chapter 06 you can read any production executor. After 09 you can
   read any production optimizer. After 12 you can read any distributed
   engine. After 15 you understand modern compilation. After 18 you can
   ship one.

## Current verification (this build)

| Stage | Status |
|-------|--------|
| contracts — 8/8 | ✔ |
| modules — 18/18 | ✔ ~150 tests |
| capstone — TPC-H-lite (8 queries) | ✔ |
| strict mypy | ✔ |
| ruff clean | ✔ |

## License

BSD-3-Clause.
