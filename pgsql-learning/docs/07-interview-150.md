# 07 — 150 Expert-Level Interview Questions

> 150 questions and answer skeletons, organised by Part of the
> curriculum. Use these for self-test, mock interviews, and as a
> reference when you're on the job.

The questions are calibrated for a "PostgreSQL expert" interview at
the 50K-RMB-and-up tier: not memorise-the-manual trivia, but
*defend your decision* questions.

---

## Part 1 — SQL Core (questions 1–30)

### Q1. What is the difference between `text`, `varchar(n)`, and `char(n)`?

- `text` — unlimited length. No performance penalty for not
  specifying a length.
- `varchar(n)` — same as `text` but with a length limit. The limit
  is decorative; it does not save space.
- `char(n)` — pads with spaces to length `n`. Almost always wrong.

Use `text` unless you have a real reason for a length limit.

### Q2. When would you use `numeric` vs `double precision`?

`numeric` for money, percentages, anything summed many times where
rounding errors compound. `double precision` for scientific data
where IEEE 754 is appropriate.

### Q3. What does `RETURNING` do?

Returns the rows affected by `INSERT`, `UPDATE`, or `DELETE`. It is
atomic with the DML — no race window between writing and reading.

### Q4. `INSERT … ON CONFLICT … DO UPDATE` vs `MERGE`. When to use which?

- `ON CONFLICT` is for upsert: target a unique constraint, decide
  per-row insert/update.
- `MERGE` is a full join-driven decision tree. PG 15+. Use it when
  you have a staging table and want to upsert/delete in one
  statement.

### Q5. `MERGE` semantics around uniqueness. What can go wrong?

`MERGE` produces an error if the join produces duplicate target
rows. Solution: pre-aggregate the source.

### Q6. `DISTINCT ON` vs `GROUP BY` vs `row_number() = 1`. Performance?

`DISTINCT ON` is often the cheapest for "first row per group"
because it can use the sort order without a window. `GROUP BY` plus
a join back is sometimes cheaper if you need aggregates too.

### Q7. What's the default ordering of NULLs in `ORDER BY`?

`NULLS LAST` for `DESC`, `NULLS FIRST` for `ASC`. Always specify
explicitly if NULLs matter.

### Q8. What's a recursive CTE? Show the canonical pattern.

```sql
WITH RECURSIVE t(n) AS (
    SELECT 1                   -- base case
    UNION ALL
    SELECT n + 1 FROM t WHERE n < 10  -- recursive case
)
SELECT * FROM t;
```

### Q9. Cycle detection in a recursive CTE.

Track the path with an array, or use `CYCLE` columns (PG 14+). Stop
when you see the same node twice.

### Q10. Difference between `INNER JOIN`, `LEFT JOIN`, `RIGHT JOIN`, `FULL OUTER JOIN`.

- `INNER`: only matched rows.
- `LEFT`: all left + matched right (NULLs where no match).
- `RIGHT`: vice versa.
- `FULL`: both sides; NULLs fill gaps.

### Q11. What is `LATERAL` and when is it the only option?

`LATERAL` lets a FROM-side subquery reference columns of preceding
FROM items. Use it for "top N per group".

### Q12. `USING` vs `ON` in a join.

`USING (c)` collapses the join columns into one. `ON c = d` keeps
both.

### Q13. How does the planner decide between nested-loop and hash join?

Cost. Nested loop is cheap when one side is small. Hash join is
faster for two large sides. The cost depends on `random_page_cost`,
`seq_page_cost`, and the inner index availability.

### Q14. What's a hash aggregate?

A `HashAggregate` plan node builds a hash table on the group key
and computes aggregates by probing the hash. Compare to a Sort +
GroupAggregate.

### Q15. Window function frame: `ROWS` vs `RANGE`.

`ROWS` is physical row count. `RANGE` is logical — based on the
`ORDER BY` values. With `RANGE BETWEEN INTERVAL '1 day' PRECEDING`,
you get all rows with `ts` within the last day.

### Q16. `LAG` / `LEAD` — and the default value.

`LAG(col, 1, default)` returns the previous row's `col`, or
`default` if there isn't one.

### Q17. `UNION` vs `UNION ALL`.

`UNION` deduplicates; `UNION ALL` does not. `UNION ALL` is faster.
Use `UNION ALL` when you know there are no duplicates, or when you
don't care.

### Q18. `INTERSECT` vs `EXCEPT`. Bag semantics?

Both are set operations; both deduplicate. `INTERSECT` returns rows
in both. `EXCEPT` returns rows in the first but not the second.

### Q19. `EXISTS` vs `IN`. Performance?

`EXISTS` is generally faster for "is there a row matching". It can
short-circuit. `IN` materializes the subquery.

### Q20. Scalar subquery in the SELECT list. What happens if it returns no row?

It returns NULL.

### Q21. Correlated vs non-correlated subquery.

A correlated subquery references columns from the outer query. It
is evaluated per row. A non-correlated subquery is evaluated once.

### Q22. `LATERAL` vs scalar subquery.

A scalar subquery in the SELECT list is evaluated per outer row.
`LATERAL` lets you return multiple rows per outer row.

### Q23. `EXPLAIN (ANALYZE, BUFFERS)` — what does `BUFFERS` show?

Per-node shared/local hit/read counts. `shared hit = 1` means the
page was already in `shared_buffers`. `read = 1` means a disk read.

### Q24. What's the difference between `EXPLAIN` and `EXPLAIN ANALYZE`?

`EXPLAIN` shows the plan. `EXPLAIN ANALYZE` *runs the query* and
shows actual row counts and timings. `EXPLAIN ANALYZE` is unsafe
for `UPDATE`/`DELETE` — wrap it in `BEGIN; … ROLLBACK;`.

### Q25. How do you read a plan tree?

Top-down. The root is the final operation (e.g., `Limit`,
`Aggregate`). The leaves are scans (`Seq Scan`, `Index Scan`).
Cost: estimated first, actual in parentheses. Row counts likewise.

### Q26. What does "mis-estimation" mean? How do you detect it?

When the planner's estimated row count differs significantly from
the actual. Look at `(rows=100)` vs `(actual rows=10000)`. Causes:
stale stats, correlated columns, expression predicates.

### Q27. The `Hash` node shows `Disk: 100kB`. What does that mean?

The hash table didn't fit in `work_mem`, so it spilled to disk.
Increase `work_mem`.

### Q28. Cost units — what are they?

Sequential page reads = 1. Random page reads = `random_page_cost`.
CPU processing = `cpu_tuple_cost` per row + `cpu_operator_cost` per
operator. Total cost is in arbitrary units, not milliseconds.

### Q29. `BUFFERS: shared hit=N read=M` — which is better?

`hit` means the page was in `shared_buffers`. `read` means it was
on disk. Hits are essentially free; reads cost I/O. A high read
count = cache miss.

### Q30. When does the planner NOT use the index?

- The table is small (seq scan is cheaper).
- The predicate doesn't match the index columns.
- The function on the indexed column hides the value (needs an
  expression index).
- The selectivity is low enough that seq scan is cheaper.

---

## Part 2 — Advanced SQL (questions 31–60)

### Q31. B-tree vs Hash. When to use which?

B-tree is the default. It supports equality, range, and `ORDER BY`.
Hash supports equality only. B-tree is almost always the right
choice; hash indexes have limited use cases.

### Q32. GIN vs GiST.

- GIN: full-text, jsonb, arrays. Build-time expensive; lookup
  cheap.
- GiST: ranges, geometric, trigrams. Build-time cheap; lookup more
  expensive.

Use GIN for `jsonb @> '{}'`, GiST for `tstzrange &&`.

### Q33. BRIN — when does it win?

Naturally-clustered, append-only data (time-series, IoT, log
tables). BRIN stores min/max per block range, so it's tiny. If the
data isn't clustered, BRIN is useless.

### Q34. Partial index. Example.

```sql
CREATE INDEX recent_orders ON orders (placed_at)
  WHERE status = 'pending';
```

A query `WHERE placed_at > now() - interval '1 day' AND status =
'pending'` uses the partial index because the predicate matches.

### Q35. Covering index (Index-Only Scan).

```sql
CREATE INDEX t_idx ON t (a, b) INCLUDE (c, d);
```

The query `SELECT c, d FROM t WHERE a = 1 AND b = 2` can be
satisfied entirely from the index without visiting the heap —
provided the visibility map is set (run `VACUUM` first).

### Q36. View vs materialized view.

- View: a saved query, inlined into plans.
- Materialized view: physically stored, refreshed explicitly.

### Q37. `REFRESH MATERIALIZED VIEW` vs `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

The former takes an `ACCESS EXCLUSIVE` lock — no reads, no writes.
The latter requires a unique index on the view and only takes a
brief lock for the swap.

### Q38. WITH CHECK OPTION.

A view with `WITH CHECK OPTION` rejects updates that would make the
row invisible to the view. Use it for `INSERT`-only views where you
want to enforce the view's predicate.

### Q39. Rules vs triggers.

Rules are pre-planner rewrites. They are subtle and dangerous.
Triggers are imperative code that fires on row events. Use
triggers. Avoid rules unless you have a specific reason.

### Q40. PL/pgSQL volatility: VOLATILE vs STABLE vs IMMUTABLE.

- VOLATILE: can return different results on each call. Default.
- STABLE: returns same result within a single query. Can be inlined
  into the planner's choices.
- IMMUTABLE: returns same result for same inputs, across queries.
  Required for expression indexes.

### Q41. SECURITY DEFINER. When and why?

When a function needs elevated privileges (e.g., write to a table
the calling user can't write to). Always `SET search_path =
pg_catalog, public` in the function.

### Q42. Trigger BEFORE vs AFTER. Row vs statement.

- BEFORE: fires before the row is written. Can return NULL to skip
  the operation.
- AFTER: fires after. Cannot return NULL. The row is already there.
- FOR EACH ROW: fires once per row.
- FOR EACH STATEMENT: fires once per statement.

### Q43. RANGE partitioning. Why is the partition key in the primary key?

PostgreSQL requires the partition key to be part of every UNIQUE
constraint, including the primary key. Otherwise a row could be in
two partitions with the same key.

### Q44. Partition pruning.

When the query's WHERE clause fixes the partition key to a single
value (or a small range), the planner scans only the relevant
partitions.

### Q45. ATTACH / DETACH partition.

`ALTER TABLE parent ATTACH PARTITION child FOR VALUES …` adds a
pre-existing table as a partition. `DETACH` removes it. Detach is
instant; attach validates the contents (takes a brief lock).

### Q46. Default partition. Gotchas.

Catches out-of-range rows. Slow if it accumulates. Monitor its size.

### Q47. postgres_fdw push-down.

The planner can push `WHERE` clauses and aggregations to the remote
server. Use `EXPLAIN VERBOSE` to see what got pushed.

### Q48. file_fdw.

Read CSVs on disk as a foreign table. Useful for ad-hoc loading.

### Q49. dblink vs postgres_fdw.

dblink executes a query and returns rows; you have to declare the
column list. postgres_fdw is a foreign table — the planner knows
the schema.

### Q50. When would you NOT use FDW?

Joins across FDW tables can be slow because the planner might pull
everything local. For analytical queries, copy the data.

### Q51. Composite index column order.

The leftmost column matters. `(a, b)` can serve `WHERE a = ?`, but
not `WHERE b = ?` alone (it can serve a sort, not a filter).

### Q52. Index-only scan. Visibility map.

The visibility map tracks pages with no dead tuples. An IOS can
skip the heap fetch only if the visibility map says the page is
all-visible. `VACUUM` updates the visibility map.

### Q53. HOT updates.

An update that doesn't change indexed columns and stays on the
same page. The new tuple is a "heap-only tuple"; no index
amendment needed.

### Q54. `pg_relation_size` vs `pg_total_relation_size`.

`pg_relation_size` is just the heap. `pg_total_relation_size`
includes TOAST and indexes. Use the latter for "how big is this
table on disk".

### Q55. JSONB GIN index. `jsonb_path_ops` vs default.

Default GIN indexes every key and value. `jsonb_path_ops` indexes
only paths — smaller, faster for `jsonb @>` queries, but cannot
support key-existence `?` queries.

### Q56. TOAST.

Out-of-line storage for fields > ~2 KB. The TOAST table is
invisible to you. Watch for tables with many TOAST pages — they
indicate wide fields.

### Q57. `int4range` vs `int8range`.

Different element types. Choose the one matching your data.

### Q58. `tstzrange @> timestamp`.

Range contains element. Use GiST index on the range column.

### Q59. `ENUM` vs `text` + CHECK.

`ENUM` saves bytes (4-byte OID vs full text) and prevents typos at
DDL time. `text` + CHECK is more flexible (you can add values
easily).

### Q60. DOMAIN vs CHECK constraint.

DOMAIN is a CHECK-wrapped *type*. Multiple columns can use it. CHECK
constraints are per-column.

---

## Part 3 — Internals (questions 61–90)

### Q61. What is MVCC?

Multi-Version Concurrency Control. Writers don't block readers; old
versions linger until vacuum. Every heap tuple has `xmin` (creator)
and `xmax` (deleter, or 0).

### Q62. How does `xmin`/`xmax` work?

- `xmin`: the transaction that created the tuple.
- `xmax`: the transaction that deleted it (or 0).
- Visibility: a tuple is visible to a snapshot if the snapshot's
  xip range considers `xmin` committed and `xmax` (if set) not
  committed.

### Q63. What is a snapshot?

`(xmin_horizon, xmax, active_xip[])`. The snapshot defines what a
transaction sees.

### Q64. Isolation levels in PostgreSQL.

- READ UNCOMMITTED → same as READ COMMITTED.
- READ COMMITTED: statement-level snapshot.
- REPEATABLE READ: transaction-level snapshot. New rows from other
  transactions are invisible.
- SERIALIZABLE: REPEATABLE READ + SSI (Serializable Snapshot
  Isolation). Detects write skew, aborts one transaction with
  `40001`.

### Q65. Lost update problem. How does PostgreSQL prevent it?

In READ COMMITTED, an `UPDATE` re-reads the latest committed row if
the row was modified by another transaction after the SELECT. The
update uses the latest version.

### Q66. Write skew. Example and how to prevent it.

Two doctors both on call. Each says "I'm on call, so the other is
not". Each updates their own row. Both succeed; nobody is on call.
Solution: SERIALIZABLE isolation, or `SELECT … FOR UPDATE` on the
shared row.

### Q67. What is the WAL?

Write-Ahead Log. Append-only journal of changes. The durability
boundary: a commit is durable when its `COMMIT` record is on disk.

### Q68. What is an LSN?

Log Sequence Number: a 64-bit offset into the WAL stream.

### Q69. What is a checkpoint?

A moment past which all heap changes are on disk. WAL can be
recycled past the checkpoint.

### Q70. REDO.

On crash recovery, replay WAL from the last checkpoint to bring
the heap up to date.

### Q71. `pg_walinspect`.

A contrib extension that lets you read WAL records. `SELECT * FROM
pg_get_wal_records_info_till_end_of_wal('0/…');`.

### Q72. `archive_mode`. WAL archive.

`on` enables archiving. `archive_command` is run on each WAL file
to copy it somewhere. The replica uses WAL to recover.

### Q73. `pg_basebackup`.

A physical backup of the entire PGDATA directory. Used to bootstrap
a replica or for full-cluster backup.

### Q74. `pg_dump` vs `pg_basebackup`.

`pg_dump` is logical (SQL statements). `pg_basebackup` is physical
(binary files). For small databases, `pg_dump` is fine. For large
databases or PITR, use `pg_basebackup`.

### Q75. `pg_class`. What's in it?

Every relation: tables, indexes, views, sequences, etc. `relkind`
tells you what. `relfilenode` tells you the on-disk file name.

### Q76. `pg_statistic`. Private to the planner.

`pg_stats` is a public view over `pg_statistic`. The latter is
intentionally hard to read directly to discourage dependency on
its format.

### Q77. `n_distinct`. How is it estimated?

For most types, `ANALYZE` runs the table and computes `-1 *
distinct_count / total_rows` as an estimate. The negative sign is
historical.

### Q78. `most_common_vals`. When is it useful?

When a small number of values dominate. The planner uses these for
selectivity estimation.

### Q79. `histogram_bounds`. Buckets.

The histogram is a series of bucket boundaries. The planner uses
it to interpolate the selectivity of a `WHERE` clause.

### Q80. Extended statistics: dependencies, ndistinct, mcv.

`CREATE STATISTICS s (dependencies) ON a, b FROM t` tells the
planner about the joint distribution of `a` and `b`. Especially
useful for correlated columns.

### Q81. `autovacuum`.

Background subsystem that runs `VACUUM` and `ANALYZE` per
table-level thresholds. **It is not optional.**

### Q82. `VACUUM` vs `VACUUM FULL`.

- `VACUUM`: reclaims space for the OS but doesn't shrink the
  table. Concurrent reads/writes allowed.
- `VACUUM FULL`: rewrites the table, no bloat. AccessExclusiveLock.

### Q83. Freeze. `HEAP_XMIN_FROZEN`.

A tuple is "frozen" when `t_infomask` has the frozen bit set. This
tuple is visible to *all* future transactions, regardless of
`xid` wraparound.

### Q84. `vacuum_freeze_min_age`.

How old an `xmin` must be (in transactions) before vacuum will
freeze it. Default 50 million.

### Q85. `autovacuum_freeze_max_age`.

Force an aggressive vacuum when any table's `relfrozenxid` reaches
this age. Default 200 million.

### Q86. txid wraparound.

`xid` is a 32-bit unsigned int. It wraps at 4 billion. Vacuum
keeps the wraparound horizon far away. If it gets within ~1
million of wrap, the cluster refuses writes.

### Q87. `pg_stat_user_tables.n_dead_tup`.

Approximate count of dead tuples. Used to detect bloat.

### Q88. `pg_stat_progress_vacuum`.

A view showing running vacuum progress. Use it to estimate
"how much longer".

### Q89. `pg_locks`. Lock types.

`relation`, `extend`, `page`, `tuple`, `transactionid`,
`virtualxid`, `advisory`, `object`. The planner takes relation and
page locks; writers take tuple locks; transactions take
transactionid locks.

### Q90. Dead tuple vs recently-dead tuple.

"Recently-dead" tuples are still visible to some open snapshot.
Vacuum can't reclaim them. Only when every snapshot that could see
them is gone can vacuum reclaim the space.

---

## Part 4 — Admin & Ops (questions 91–120)

### Q91. Streaming replication. Step by step.

1. Configure primary: `wal_level = replica`, `max_wal_senders`,
   `wal_keep_size` (or slots).
2. Configure `pg_hba.conf` for replication connections.
3. On the replica: `pg_basebackup -h primary -D $PGDATA`.
4. Create `standby.signal` (PG 12+) or `recovery.conf` (older).
5. Configure `primary_conninfo`.
6. Start the replica. It will replay WAL.

### Q92. Synchronous vs asynchronous replication.

- Asynchronous: replica may be behind. No commit latency penalty.
- Synchronous: replica acknowledges the commit before primary
  returns. Latency penalty, but no data loss if primary dies.

### Q93. Logical replication. Use cases.

- Selective replication (only some tables).
- Cross-version replication.
- Zero-downtime upgrades: replicate to a new-version cluster,
  switch over.

### Q94. Logical replication gotchas.

- DDL is not replicated (PG 15+ supports DDL replication for some
  cases).
- Sequences are not replicated. Use `ALTER SEQUENCE … OWNED BY`
  or `setval` on the subscriber.
- Large transactions can block the apply worker.

### Q95. `pg_basebackup` formats.

`plain` (default) and `tar`. `tar` is faster for large backups.

### Q96. WAL archive command.

A shell command run on each WAL file. Typical: copy to S3 or NFS.
Must be idempotent and atomic; `cp` is fine, but be careful with
retries.

### Q97. PITR.

Point-In-Time Recovery. Restore a base backup, then replay WAL up
to a specific timestamp or LSN. The base backup is in PGDATA, and
WAL files come from the archive.

### Q98. `recovery.signal` and `recovery.conf`.

PG 12+: `recovery.signal` (a marker file) plus `postgresql.conf`
recovery settings. Pre-12: `recovery.conf`.

### Q99. `pg_stat_replication`. Key columns.

`sent_lsn`, `replay_lsn`, `sync_state`, `client_addr`. Lag is
`sent_lsn - replay_lsn`.

### Q100. Switchover vs failover.

Switchover: planned, primary is healthy. Drain writes, wait for
replica to catch up, promote, redirect clients.
Failover: unplanned, primary is dead. Promote the most caught-up
replica. Risk: data loss if replica was behind.

### Q101. `pg_hba.conf` rule precedence.

First matching rule wins. Strictest first.

### Q102. SCRAM-SHA-256 vs md5.

SCRAM-SHA-256 is the default since PG 10; it's a challenge-response
mechanism that doesn't reveal the password to the server. md5 is
older and sends the password hash over the wire (still better than
plain, but worse than SCRAM).

### Q103. RLS. When does it apply?

After the privilege check. If the user has SELECT on a table but
no rows match the RLS predicate, they see zero rows.

### Q104. `current_setting('app.foo', true)`. The second argument.

`true` = missing_ok. The function returns NULL instead of erroring
if the setting doesn't exist.

### Q105. pgAudit.

An extension that emits audit log entries for DML and DDL. Used
for compliance.

### Q106. `pg_stat_statements`.

A shared-memory structure that records per-normalised-query stats.
Requires `shared_preload_libraries`.

### Q107. `auto_explain`.

A shared library that auto-logs `EXPLAIN ANALYZE` for slow queries.
Set `auto_explain.log_min_duration`.

### Q108. Top 5 monitoring queries.

1. `pg_stat_activity` (active queries).
2. `pg_locks` (lock contention).
3. `pg_stat_replication` (replication lag).
4. `pg_stat_user_tables` (bloat, dead tuples).
5. `pg_stat_statements` (slow queries).

### Q109. Top 5 alerts.

1. Disk usage > 80%.
2. `age(datfrozenxid)` > 200 million.
3. `pg_last_xact_replay_timestamp()` > 60s old.
4. Active queries > 100 (pool exhausted).
5. `pg_stat_archiver.last_failed_time` recent.

### Q110. `pg_dump` flag set.

`-Fc` (custom format, compressed, parallel-restore capable).
`-Fd` (directory format, parallel dump). `--schema-only`,
`--data-only`. `-t table`. `-n schema`.

### Q111. Restoring a `pg_dump` custom format.

`pg_restore -d learning dump.sql`. Use `-j` for parallel.

### Q112. `COPY`. Why is it faster than `INSERT`?

`COPY` is a bulk protocol that avoids per-row parsing and per-row
WAL records (when not in a transaction).

### Q113. `COPY FREEZE`.

Bulk-load tuples with `t_infomask = HEAP_XMIN_FROZEN`. Skips
vacuum's work later. Only works in the same transaction as the
table creation, or when the table is empty.

### Q114. contrib extensions you should know.

`pg_stat_statements`, `auto_explain`, `pg_prewarm`, `pg_trgm`,
`citext`, `hstore`, `pgcrypto`, `uuid-ossp`, `pageinspect`,
`pg_walinspect`, `pg_buffercache`.

### Q115. pgvector.

Extension providing the `vector` type and HNSW / IVFFLAT indexes.
Used for similarity search.

### Q116. HNSW vs IVFFLAT.

- HNSW: graph-based, high recall, slower build, more memory.
- IVFFLAT: cluster-based, lower recall, faster build, less
  memory.

For most production use, HNSW is the right choice. Tune `ef_construction`,
`m`, `ef_search`.

### Q117. `pg_trgm` and `<->>`.

`<->>` is the trigram distance. A GIN trigram index supports
`%` (similarity) and `<->>` queries.

### Q118. citext.

Case-insensitive text. Avoid `lower()` on both sides of comparisons.

### Q119. `pg_prewarm`.

Loads a table or index into `shared_buffers`. Use it after a
restart, or for hot data.

### Q120. `pg_buffercache`.

View of every page currently in `shared_buffers`. Use it to verify
that hot data is cached.

---

## Part 5 — Performance (questions 121–150)

### Q121. The cost model in one sentence.

Sequential page reads cost 1, random reads cost `random_page_cost`,
each tuple processed costs `cpu_tuple_cost`, each operator costs
`cpu_operator_cost`, and the planner picks the plan with the
lowest total cost.

### Q122. `random_page_cost = 1.1` for SSD. When is this wrong?

When the data is too large to fit in OS cache. If 90% of the
accesses go to disk (cold cache), random and sequential are
similar; if 90% are cached (hot cache), they are identical.

### Q123. Nested loop with index.

When the outer side is small and the inner side has an index.
`for each outer row, look up in inner index`.

### Q124. Hash join.

Build a hash table on the inner side. For each outer row, probe.
Best for two large sides.

### Q125. Merge join.

Both sides are sorted on the join key. Two pointers walk them in
parallel. Best for already-sorted data.

### Q126. Aggregate strategies.

- HashAggregate: build hash, compute aggregates. Memory-bound.
- GroupAggregate: sort, then group. CPU-bound.

### Q127. `FOR UPDATE` vs `FOR NO KEY UPDATE`.

`FOR UPDATE` blocks FK enforcement (so no concurrent insert of a
row referencing this one). `FOR NO KEY UPDATE` does not.

### Q128. `FOR KEY SHARE`.

The weakest row lock. Used by FK triggers. Other transactions can
read but not delete or change the key.

### Q129. `SKIP LOCKED`.

Skip rows that are currently locked. Used for queues.

### Q130. `NOWAIT`.

Fail immediately if the row is locked. Returns SQLSTATE 55P03.

### Q131. Advisory locks.

Application-defined locks. `pg_advisory_lock(key)` and friends.
Session-scoped or transaction-scoped.

### Q132. Deadlock detection.

The postmaster detects deadlock cycles after `deadlock_timeout`
(default 1s) and aborts one transaction with 40P01.

### Q133. `SELECT FOR UPDATE` order.

Always acquire in the same order across all transactions. This
prevents deadlocks.

### Q134. Parallel workers and GUCs.

`max_parallel_workers_per_gather`, `max_parallel_workers`,
`min_parallel_table_scan_size`, `parallel_tuple_cost`,
`parallel_setup_cost`.

### Q135. Why doesn't every query parallelize?

The overhead is too high for small queries. `parallel_setup_cost`
+ `parallel_tuple_cost * rows` > serial cost → serial plan.

### Q136. `pg_prewarm`. Risks.

Loads pages into `shared_buffers`. If the table is bigger than
`shared_buffers`, you push other things out.

### Q137. Cold cache after restart.

The OS page cache is also cold. Either `pg_prewarm` (into
`shared_buffers`) or let the OS warm up.

### Q138. WAL compression.

`wal_compression = on` (or `zstd`/`pglz` in PG 15+). Reduces WAL
volume, increases CPU.

### Q139. Read replica lag tolerance.

The application should tolerate some lag. If you need strict
consistency, read from the primary.

### Q140. `synchronous_standby_names`.

Names of synchronous replicas. Empty = async.

### Q141. Replication slots. Pitfalls.

A slot holds WAL until the consumer acknowledges. If the consumer
is gone, WAL piles up. Monitor slot lag.

### Q142. Vertical scaling first. Why?

A bigger box is cheaper than sharding. Sharding adds engineering
complexity (cross-shard queries, distributed transactions, joins).

### Q143. Citus. When to use it.

Citus is a sharding extension. Use it when:
- Working set > 10× RAM.
- Single-tenant, sharded by a single key.
- Query patterns are well-known.

### Q144. Citus gotchas.

Cross-shard joins are slow. Distributed transactions are slow.
Sequences must be made shard-aware. Foreign keys across shards
don't work.

### Q145. Foreign-data-wrapper sharding.

Each shard is a Postgres FDW server on a coordinator. Useful for
small-scale sharding; less performant than Citus.

### Q146. Connection pooling. Why?

Postgres connections are expensive (~10 MB each). pgBouncer
multiplexes many client connections to fewer server connections.

### Q147. Transaction pooling vs session pooling.

Transaction pooling: each transaction gets a connection, returned
when the transaction ends. Doesn't support session-level features
(`SET`, `LISTEN`, prepared statements).
Session pooling: one connection per client.

### Q148. `statement_timeout`.

Abort queries that take longer than this. Useful as a safety net.

### Q149. `idle_in_transaction_session_timeout`.

Abort sessions that are `idle in transaction` for too long. Closes
the door on leaked transactions.

### Q150. The "expert" answer to "how do I tune PostgreSQL?"

1. **Measure first.** `pg_stat_statements`, `auto_explain`,
   `track_io_timing`.
2. **Tune the workload.** Indexes, schema, query patterns.
3. **Then tune the cluster.** `shared_buffers`, `work_mem`,
   `random_page_cost`.
4. **Then tune the OS.** `vm.swappiness`, I/O scheduler, file
   system.

Tuning the cluster without tuning the workload is wasted effort.
