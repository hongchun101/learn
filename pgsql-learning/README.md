# PostgreSQL — A From-0-to-Expert Curriculum

> 28 modules, one Docker stack, every module is runnable on a fresh `postgres:16`.
> Read this top-to-bottom and you can read and write any production-grade
> PostgreSQL system, defend your choices about correctness and performance,
> and ship a high-availability cluster.

## What this is

A complete, runnable curriculum on **PostgreSQL itself**. Every module is a
small, self-contained set of SQL files, diagrams, and exercises; modules
build on top of one another; the capstone wires the full system together
into a small but real e-commerce backend with replication, backups,
pgvector semantic search, and a read/write split under load.

The goal is not "I can use a `SELECT`" — it's:

- I can read an `EXPLAIN ANALYZE` plan and tell whether the planner picked
  the right join order, whether an index hint is needed, whether statistics
  are stale, whether the work_mem is the right bucket size.
- I can defend a choice between BRIN and GiST for a time-series workload,
  between logical replication and streaming replication, between
  `pg_dump` and `pg_basebackup`, between a B-tree on `(a)` and a B-tree on
  `(a, b)`.
- I can diagnose a serialization failure, a deadlock, a vacuum freeze
  emergency, a runaway replication slot, a planner regression introduced
  by a migration.
- I can ship a real cluster: primary + streaming replica + read pool +
  backups + monitoring + alerting + extensions, and I know *why* each of
  those is configured the way it is.

## Reading order

```
PART 1 — SQL CORE (modules 01–10)
01  types and tables                  ── numeric, text, json, arrays, ranges
02  DML and queries                   ── SELECT, WHERE, ORDER BY, DISTINCT, NULLs
03  joins                              ── inner / left / right / full / cross / lateral
04  DDL and constraints               ── PK, FK, UNIQUE, CHECK, GENERATED, IDENTITY
05  CTEs and recursive                ── non-recursive, recursive, cycle, data-modifying
06  aggregates and grouping           ── GROUP BY, HAVING, FILTER, rollup, cube
07  window functions                  ── OVER, PARTITION BY, frame, named windows
08  set operations and UNNEST         ── UNION/INTERSECT/EXCEPT, arrays, jsonb arrays
09  subqueries and LATERAL            ── scalar, correlated, EXISTS, FROM-side LATERAL
10  EXPLAIN and ANALYZE               ── plan trees, costs, buffers, mis-estimation

PART 2 — ADVANCED SQL (modules 11–15)
11  indexes                           ── btree, hash, GIN, GiST, BRIN, expression, partial
12  views and materialized views      ── rules, updatable views, REFRESH, incremental
13  functions, triggers, PL/pgSQL     ── varlena, SECURITY, EVENT/ROW, exception model
14  partitioning                      ── RANGE/LIST/HASH, declarative, attachment
15  FDW and dblink                    ── postgres_fdw, file_fdw, dblink, push-down

PART 3 — INTERNALS (modules 16–19)
16  MVCC and isolation                ── xmin/xmax, snapshot, anomalies, SI vs SERIALIZABLE
17  WAL and recovery                  ── LSN, REDO, checkpoints, crash recovery
18  planner and system catalogs       ── pg_stat, pg_class, statistics, custom plans
19  vacuum and txid wraparound        ── MVCC bloat, freeze, anti-wraparound, autovacuum

PART 4 — ADMIN & OPS (modules 20–24)
20  replication and HA                ── streaming, logical, slots, failover, switchover
21  backup and PITR                   ── pg_dump, pg_basebackup, WAL archive, restore
22  monitoring and pg_stat            ── pg_stat_statements, pg_stat_activity, snapshots
23  roles and security                ── pg_hba, roles, RLS, GRANT, column-level, audit
24  extensions and pgvector           ── contrib, CREATE EXTENSION, vectors, HNSW/IVFFLAT

PART 5 — PERFORMANCE (modules 25–28)
25  query tuning and statistics       ── ANALYZE, extended stats, n_distinct, hints
26  locking and deadlocks             ── row locks, advisory, NOWAIT, deadlocks, retries
27  parallel and I/O                  ── parallel workers, I/O patterns, pg_prewarm
28  scaling and sharding              ── read replicas, partitioning strategies, Citus

CAPSTONE — small real e-commerce backend
   users / orders / order_items / products / reviews
   + pgvector semantic search over reviews
   + streaming replica + read-only routing
   + pg_dump + WAL archive + PITR
   + monitoring + alerting
```

After modules 01–10 you can write and read any complex SQL.
After modules 11–15 you can build the data layer of a real product.
After modules 16–19 you can read any error message in `pg_log` and explain
*why* it happened at the storage and transaction level.
After modules 20–24 you can ship and operate a PostgreSQL cluster.
After modules 25–28 you can defend every performance choice with a
planner-level argument.

## The five universal problems

Modules are organised around the same five problems in every section:

1. **Model** — how do I represent a row, an index, a constraint, a JSON
   document, a vector?
2. **Query** — how does a SQL string become a plan tree, and a plan tree
   become rows?
3. **Isolate** — what does a transaction see, and when does it conflict?
4. **Persist** — what gets to disk, in what order, with what guarantee?
5. **Operate** — replicas, backups, monitoring, security, alerting.

## The five cross-module contracts

Every module implements — or depends on — one of these contracts:

| # | Contract | Where introduced | Reused in |
|---|----------|-------------------|-----------|
| 1 | `EXPLAIN (ANALYZE, BUFFERS) <query>` returns the plan tree | module 10 | modules 11, 18, 25, 26, 27 |
| 2 | `Snapshot.is_visible(xmin, xmax, snapshot)` | module 16 | modules 17, 19 |
| 3 | `Index.am = 'btree' | 'hash' | 'gin' | 'gist' | 'brin'` | module 11 | modules 12, 25, 27 |
| 4 | `WalRecord.lsn` and `WalRecord.next_lsn` | module 17 | modules 20, 21 |
| 5 | `pg_stat_statements` row per normalised query | module 22 | modules 25, 28 |

The contract files live in `sql/`; each module opens with the contract and
re-asserts the contract at the end with at least one query that fails on a
known regression (lost update, write skew, bag semantics, planner
mis-estimation, replication lag, runaway vacuum, wraparound, etc.).

## Quick start

```bash
cd pgsql-learning
cp .env.example .env                     # connection defaults
docker compose -f docker/docker-compose.yml up -d            # primary + replica
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning
# run module 01
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/01-types-and-tables/demo.sql
```

Each `modules/NN-...` folder is independent: open the `README.md`, paste
the SQL into `psql`, and answer the exercises in `exercises/`. Verifiers
live in `scripts/`.

## What an expert can do after this curriculum

| Skill | Where |
|-------|-------|
| Read `EXPLAIN ANALYZE` and tune the query and the schema | modules 10, 11, 18, 25 |
| Defend an index choice (btree vs GIN vs BRIN vs partial) | modules 11, 25, 27 |
| Diagnose and fix a serialization failure or deadlock | modules 16, 26 |
| Diagnose and fix runaway bloat and txid wraparound | modules 17, 19 |
| Design a backup strategy that hits any RPO and RTO target | module 21 |
| Run a hot-standby failover and switchover safely | modules 20, 21 |
| Tune `shared_buffers`, `work_mem`, `effective_cache_size` for a workload | modules 25, 27 |
| Choose between logical and physical replication | module 20 |
| Build an RLS policy that survives a real attack surface | module 23 |
| Ship a semantic-search product with pgvector | module 24 |
| Decide between PostgreSQL and a distributed SQL store | module 28 |

## Layout

```
pgsql-learning/
├── README.md                       ── this file
├── docker/                         ── compose stack (primary + replica + pgadmin)
├── .env.example
├── docs/                           ── 00-overview, 01-architecture, glossary
├── modules/                        ── 28 module folders, each with SQL + exercises
├── sql/00-init/                    ── initial schema seed (loaded by Docker on first init)
├── sql/contracts/                  ── the five cross-module contracts
├── exercises/                      ── 28 graded problem sets + solutions
├── capstone/                       ── full-stack project the curriculum targets
├── scripts/                        ── verifiers, helpers, run-all
├── diagrams/                       ── mermaid diagrams exported as .mmd
├── glossary/                       ── per-module vocab index → docs/02-glossary.md
├── data/                           ── scratch dir for backups / WAL archive
└── .github/workflows/              ── CI: run module verifiers on every change
```

## Reading this repo

1. Read `docs/00-overview.md` once. It defines the five problems and the
   vocabulary the rest of the repo uses.
2. Run module 01 end-to-end. Each module is structured the same way; once
   you understand one, you understand all of them.
3. Pick the module closest to your work, run its SQL, then read its
   parent and child modules.
4. After module 10 you can write any production query.
5. After module 15 you can model any product's data layer.
6. After module 19 you can read any PostgreSQL error message.
7. After module 24 you can ship a real cluster.
8. After module 28 you can defend every performance choice.

## Quality gates

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/sql/contracts/00-master-check.sql          # contract checks
./scripts/verify-modules.sh                                  # per-module verifier loop
./scripts/verify-capstone.sh                                 # end-to-end capstone
```

## Current verification (this build)

| Stage | Status |
|-------|--------|
| docker stack — primary + replica up | ✔ |
| contracts — 5/5 | ✔ |
| modules — 28/28 | ✔ |
| capstone — small e-commerce + replica + backup + pgvector | ✔ |

## License

BSD-3-Clause.
