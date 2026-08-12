# 03 — The 30 / 60 / 90-Day Expert Roadmap

> Goal of this document: turn "I read the modules" into "I can defend
> any PostgreSQL decision in front of a senior DBA at a 50K-RMB job
> interview". Three milestones, each one month, each one is a hard gate.

## Who this is for

You have written SQL for at least six months. You can write a `JOIN`,
a `GROUP BY`, and you know what an index is. You have **not** read
an `EXPLAIN ANALYZE` plan and *known what was wrong*. You have **not**
sat in front of a customer whose database was down.

This curriculum is the bridge.

## How to use this roadmap

Each phase has three things:

1. **A gate** — what you must demonstrate to pass the phase. Without
   passing the gate, do not move on. Re-do the exercises of the modules
   in that phase before you do.
2. **A schedule** — what to do each day. The schedule assumes
   90 minutes/day, 6 days a week. If you have less, the schedule
   stretches; the gates do not.
3. **A deliverable** — a tangible artifact you must produce. The
   curriculum is theory; the deliverable is proof you can ship.

---

## Phase 1 — Days 1 to 30 — "SQL competent in production"

### Gate

You can:

- Look at an `EXPLAIN (ANALYZE, BUFFERS)` plan and tell, in under
  60 seconds, whether the planner picked the right join order, the
  right access method, and the right aggregation strategy.
- Write a `MERGE`, an `INSERT … ON CONFLICT`, a recursive CTE that
  walks a tree, a window function with a frame clause, and a LATERAL
  join — without looking them up.
- Tell the difference between `text`, `varchar(n)`, and `char(n)`,
  and why `numeric(12,2)` is the only correct type for money.
- Run a multi-statement `psql` script against a fresh cluster and
  not break anything.

### Modules

```
PART 1 — SQL CORE (modules 01–10)
01  types and tables
02  DML and queries
03  joins
04  DDL and constraints
05  CTEs and recursive
06  aggregates and grouping
07  window functions
08  set operations and UNNEST
09  subqueries and LATERAL
10  EXPLAIN and ANALYZE
```

### Day-by-day

| Day | Module | What to do |
|-----|--------|-----------|
| 1   | 01     | Read README + run `demo.sql`. Write 3 of your own examples. |
| 2   | 01     | Solve all exercises blind. Compare to solutions. |
| 3   | 02     | Read README + run demo. |
| 4   | 02     | Solve all exercises. Pay attention to `MERGE` — it's PG 15+. |
| 5   | 03     | Read + demo. |
| 6   | —      | Rest. Or re-do a previous module's hardest exercise. |
| 7   | 04     | Read + demo. Understand `NOT VALID` + `VALIDATE`. |
| 8   | 04     | Solve exercises. Write your own `big_table` and time the FK migration with vs without `NOT VALID`. |
| 9   | 05     | Read + demo. Build a recursive CTE for an org chart. |
| 10  | 05     | Solve exercises. |
| 11  | 06     | Read + demo. Master `FILTER`, `ROLLUP`, `CUBE`. |
| 12  | 06     | Solve exercises. |
| 13  | 07     | Read + demo. Write a window function with `ROWS BETWEEN`. |
| 14  | 07     | Solve exercises. |
| 15  | 08     | Read + demo. Distinguish `UNION` vs `UNION ALL`. |
| 16  | 08     | Solve exercises. |
| 17  | 09     | Read + demo. Write a LATERAL join. |
| 18  | 09     | Solve exercises. |
| 19  | 10     | Read + demo. This is the foundation of everything that follows. |
| 20  | 10     | Solve exercises. Without looking at the solution, look at an `EXPLAIN` and explain every node. |
| 21  | 1–10   | **Phase gate**. Pick any table in `sql_core` schema. Write five queries against it. For each, run `EXPLAIN (ANALYZE, BUFFERS)` and explain what you see. |
| 22  | 1–10   | Re-do the modules where you scored <80% on exercises. |
| 23  | 1–10   | Re-do the modules where you scored <80% on exercises. |
| 24  | 1–10   | Build your own dataset (e.g., a year of fake orders). Apply everything from Part 1. |
| 25  | 1–10   | Same dataset, write a query that hits three tables and a window function. Time it before and after adding an index. |
| 26  | 1–10   | **Deliverable #1**: write `docs/my-notes/01-sql-foundation.md` — every concept from Part 1, in your own words, with one example each. |
| 27  | 1–10   | Read `docs/00-overview.md` and `docs/01-architecture.md`. |
| 28  | 1–10   | Read `docs/02-glossary.md`. |
| 29  | 1–10   | Quiz yourself with `docs/07-interview-150.md` questions 1–50. |
| 30  | 1–10   | **Phase gate #2**: schedule a 30-minute interview with yourself. Pick 5 questions at random from `docs/07-interview-150.md` Part 1. Answer without notes. |

### Deliverable

`docs/my-notes/01-sql-foundation.md` — your own summary of Part 1 in
your own words, with at least one example per concept. If you can't
write it, you haven't learned it.

---

## Phase 2 — Days 31 to 60 — "Index and storage literate"

### Gate

You can:

- For any predicate in any query, name the index access method
  (`btree`, `hash`, `GIN`, `GiST`, `BRIN`) that should serve it, and
  why.
- Read a heap tuple header and tell me the `xmin`, `xmax`, and the
  visibility flag.
- Explain what a WAL record is, what an LSN is, what a checkpoint is,
  and why the WAL is the durability boundary.
- Tell me what vacuum is for, when it doesn't keep up, and what
  happens at txid wraparound.

### Modules

```
PART 2 — ADVANCED SQL (modules 11–15)
11  indexes
12  views and materialized views
13  functions, triggers, PL/pgSQL
14  partitioning
15  FDW and dblink

PART 3 — INTERNALS (modules 16–19)
16  MVCC and isolation
17  WAL and recovery
18  planner and system catalogs
19  vacuum and txid wraparound
```

### Day-by-day

| Day | Module | What to do |
|-----|--------|-----------|
| 31  | 11     | Read + demo. This is *the* module. Spend 3 days on it if you need. |
| 32  | 11     | Solve exercises. Write a `BRIN` index on a time-series table yourself. |
| 33  | 11     | Read the README's "Mental model" section and write down the decision tree for picking an access method. |
| 34  | 12     | Read + demo. Build a materialized view, refresh it concurrently. |
| 35  | 12     | Solve exercises. |
| 36  | 13     | Read + demo. PL/pgSQL is the language you'll spend the most time in. |
| 37  | 13     | Solve exercises. Write a trigger that calls `pg_notify`. |
| 38  | 14     | Read + demo. Range partitioning. |
| 39  | 14     | Solve exercises. Build a 12-partition monthly table; insert into it; EXPLAIN a query that touches only one partition. |
| 40  | 15     | Read + demo. FDW. |
| 41  | 15     | Solve exercises. Set up a `postgres_fdw` server pointing at your own replica. |
| 42  | 16    | Read + demo. MVCC. This is the most important internal. |
| 43  | 16    | Solve exercises. Open `pageinspect`, look at a tuple header. |
| 44  | 17    | Read + demo. WAL. |
| 45  | 17    | Solve exercises. Force 1000 inserts; observe LSN growth. |
| 46  | 18    | Read + demo. Cost model + extended statistics. |
| 47  | 18    | Solve exercises. Build a skewed table; run `CREATE STATISTICS`. |
| 48  | 19    | Read + demo. Vacuum. |
| 49  | 19    | Solve exercises. Create 10000 dead tuples; observe `n_dead_tup`; run `VACUUM`. |
| 50  | 11–19 | **Phase gate**. Pick any production-like scenario. Write the DDL + indexes for it. Justify every index choice. |
| 51  | 11–19 | Re-do exercises where you scored <80%. |
| 52  | 11–19 | Re-do exercises where you scored <80%. |
| 53  | 11–19 | Read `docs/04-incident-playbook.md` as you go. |
| 54  | 11–19 | Read `docs/05-pitfalls.md`. |
| 55  | 11–19 | **Deliverable #2**: `docs/my-notes/02-internals-handbook.md` — for each of the 5 universal problems (Model, Query, Isolate, Persist, Operate), explain how a Part-2/3 module addresses it. |
| 56  | 11–19 | Quiz: `docs/07-interview-150.md` questions 51–100. |
| 57  | 11–19 | Quiz: `docs/07-interview-150.md` questions 51–100 (no notes). |
| 58  | 11–19 | **Phase gate #2**: explain to a friend, in 5 minutes each, what `xmin`/`xmax` is, what `WAL` is, and why vacuum can't be skipped. |
| 59  | 11–19 | Re-read modules where you were weakest. |
| 60  | 11–19 | **Deliverable #3**: `docs/my-notes/03-internals-deep-dive.md` — pick three of the 5 universal problems and explain how *you* would implement them in a fresh cluster. |

### Deliverables

Two notes files that document, in your own words, why each Part 2
and Part 3 module exists. If you can't write it from memory, you
haven't learned it.

---

## Phase 3 — Days 61 to 90 — "Operate a real cluster"

### Gate

You can:

- Set up a streaming replication pair from scratch.
- Take a `pg_basebackup`, set up WAL archiving, restore a backup,
  perform PITR to a timestamp.
- Read `pg_stat_statements` and identify the top 5 slow queries.
- Build an RLS policy and prove it denies without the right
  `current_setting`.
- Decide when to shard, when to add a replica, and when to do neither.

### Modules

```
PART 4 — ADMIN & OPS (modules 20–24)
20  replication and HA
21  backup and PITR
22  monitoring and pg_stat
23  roles and security
24  extensions and pgvector

PART 5 — PERFORMANCE (modules 25–28)
25  query tuning and statistics
26  locking and deadlocks
27  parallel and I/O
28  scaling and sharding

CAPSTONE — small real e-commerce backend
```

### Day-by-day

| Day | Module | What to do |
|-----|--------|-----------|
| 61  | 20     | Read + demo. Run `setup-replica.sh`; observe `pg_stat_replication`. |
| 62  | 20     | Run `promote-replica.sh`. Verify `pg_is_in_recovery()` is `false` on the new primary. |
| 63  | 20     | Solve exercises. |
| 64  | 21     | Read + demo. `pg_basebackup` + WAL archive. |
| 65  | 21     | Run `setup-archive.sh`. Verify WAL files in the archive dir. |
| 66  | 21     | Run `point-in-time-recovery.sh`. Verify the cluster comes up at a specific timestamp. |
| 67  | 21     | Solve exercises. |
| 68  | 22     | Read + demo. Install `pg_stat_statements`. Run a slow query. Capture stats. |
| 69  | 22     | Run `snapshot-stats.sh`. Solve exercises. |
| 70  | 23     | Read + demo. Roles, RLS, GRANT. |
| 71  | 23     | Solve exercises. Write a real RLS policy. Test it from two psql sessions. |
| 72  | 24     | Read + demo. Extensions, pg_trgm, pgvector. |
| 73  | 24     | Solve exercises. If pgvector is available, build a HNSW index and run a similarity query. |
| 74  | 25     | Read + demo. Cost model + extended stats. |
| 75  | 25     | Solve exercises. EXPLAIN a query before and after adding an index; before and after extended stats. |
| 76  | 26     | Read + demo. Locking + advisory locks. |
| 77  | 26     | Solve exercises. Reproduce a deadlock in two psql sessions. |
| 78  | 27     | Read + demo. Parallel workers, pg_prewarm. |
| 79  | 27     | Solve exercises. |
| 80  | 28     | Read + demo. Read replicas, vertical scaling, Citus. |
| 81  | 28     | Solve exercises. |
| 82  | 1–28  | Run the capstone end-to-end. |
| 83  | capstone | Read every capstone SQL. Modify one query. |
| 84  | capstone | Run `scripts/verify-capstone.sh`. |
| 85  | 1–28  | **Phase gate**. Schedule a 90-minute "on-call drill" with yourself. |
| 86  | 1–28  | Drill: read `docs/04-incident-playbook.md` and answer "what would I check first?" for each scenario. |
| 87  | 1–28  | Re-do modules where you scored <80%. |
| 88  | 1–28  | **Deliverable #4**: `docs/my-notes/04-capstone-report.md` — run the capstone; report your EXPLAIN findings on each query. |
| 89  | 1–28  | Quiz: `docs/07-interview-150.md` questions 101–150 (no notes). |
| 90  | 1–28  | **Final gate**: 90-minute mock interview. Use `docs/08-career-roadmap.md` for the format. |

### Deliverables

`docs/my-notes/04-capstone-report.md` — the capstone run, with
EXPLAIN output for each query and a one-paragraph writeup of what
the planner did and why.

---

## What "expert" means at the end of 90 days

You are *not* done. You have **finished the curriculum**. The next
phase is *operating a real cluster under real load* — but you can
do that because the curriculum has given you the vocabulary to
learn it on the job.

What you can say in an interview:

| Question | Answer skeleton |
|----------|-----------------|
| "Read this `EXPLAIN` for me." | "Plan tree is `Hash Join` over `Seq Scan` of `a` and `Index Scan` of `b`. The planner picked hash join because the inner side is fully cached in `shared_buffers`; we can verify by reading `Buffers: shared hit=...`. The estimated rows match actual, so stats are fresh; if they didn't, I'd run `ANALYZE` or `CREATE STATISTICS`." |
| "Why is this query slow?" | "Three possibilities: bad plan (check `EXPLAIN ANALYZE`), stale stats (run `ANALYZE`), or wrong indexes (read predicates, check access method, check selectivity)." |
| "How would you back this up?" | "Depends on RPO. If loss-tolerant: `pg_dump` nightly. If zero-loss: streaming replication + WAL archiving, plus `pg_basebackup` daily for DR. PITR target: `restore_command` + `recovery.signal` + `recovery_target_time`." |
| "How would you scale this?" | "Vertical first. If we're CPU-bound, add cores. If we're I/O-bound, NVMe + `random_page_cost=1.1`. If we're read-bound, replicas + pgBouncer. If we're write-bound, partitioning. Sharding only as a last resort — joins cross shards, transactions cross shards, debugging crosses shards." |
| "Why is vacuum important?" | "MVCC: every UPDATE writes a new tuple; the old one is dead. If vacuum doesn't keep up, the table bloats, indexes bloat, queries slow down, and eventually `xid` wraparound protection kicks in and the cluster refuses writes." |

If you can answer all five, you are interview-ready.

## Time math

- 90 days × 90 minutes = 135 hours.
- 135 hours / 28 modules = ~5 hours per module.
- The reality: parts 1–10 take ~30 hours, parts 11–15 take ~25 hours,
  parts 16–19 take ~30 hours, parts 20–24 take ~30 hours, parts 25–28
  take ~20 hours.
- Total: ~135 hours.

This is a 5-credit graduate course compressed into 90 days. Treat it
that way.

## When you finish

You will:

1. Have run every module.
2. Have written 4 deliverable notes files in `docs/my-notes/`.
3. Have run the capstone end-to-end.
4. Have answered 150 interview questions from memory.
5. Have simulated an on-call drill.

That's the floor. From here, the path to 50K and beyond is:

1. Get a job where PostgreSQL is the system of record, not the
   cache. (You will learn more in 90 days at that job than in any
   curriculum.)
2. Read `pg_source` for the modules you don't yet understand.
3. Subscribe to `pgsql-hackers` and read every commit message for
   the version you're running.
4. Contribute a patch. It doesn't have to land. The act of writing
   it teaches you things nothing else does.
