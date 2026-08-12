# 06 — Tuning Cheatsheet

> Every GUC that matters in production, with the question it answers
> and the right answer for a typical OLTP workload. Use this as a
> reference, not as gospel — every workload is different.

## How to read this document

Each row has:

- **GUC** — the parameter name.
- **Question** — what you're trying to decide when you set it.
- **Default** — PostgreSQL's default (since 16 unless noted).
- **OLTP** — what to set for an OLTP workload (web app, 10K QPS).
- **OLAP** — what to set for an OLAP workload (analytics, 100-row
  scans).
- **Memory math** — the formula that limits this parameter.

If you remember one thing: the **rule of 25% for shared_buffers,
and per-connection for work_mem**.

---

## Memory regions

These are the ones you actually tune. The rest are auto-tuned.

### `shared_buffers`

- **Question**: How much memory does PostgreSQL have for cached
  pages?
- **Default**: 128 MB
- **OLTP**: 25% of RAM. A 64 GB box → 16 GB.
- **OLAP**: 25% of RAM. Same.
- **Memory math**: hard ceiling; reserve RAM for OS cache,
  `work_mem * connections`, and the application.
- **Risk if too high**: OOM killer, especially when `work_mem`
  allocations add up.
- **Risk if too low**: more disk I/O, slower queries.
- **How to verify**: `pg_buffercache` extension. Aim for > 95%
  cache hit on hot data.

### `work_mem`

- **Question**: How much memory can a sort, hash, or hash-aggregate
  use before spilling to disk?
- **Default**: 4 MB
- **OLTP**: 16–64 MB. Set per query, not per session.
- **OLAP**: 256 MB – 1 GB. Analytics queries can use a lot.
- **Memory math**: `work_mem * max_connections` should be < 25% of
  RAM. With 200 connections and `work_mem = 64 MB`, that's 12.5 GB.
- **Risk if too high**: OOM under concurrent load.
- **Risk if too low**: sort/hash spills to disk; queries 10–100×
  slower.
- **How to verify**: `EXPLAIN (ANALYZE)` shows `Disk` in sort/hash
  nodes. If you see `Disk`, raise `work_mem` for that query class.

### `maintenance_work_mem`

- **Question**: How much memory does `VACUUM`, `ANALYZE`, `CREATE
  INDEX`, `ALTER TABLE ADD FOREIGN KEY` use?
- **Default**: 64 MB
- **OLTP**: 256 MB – 1 GB. Big tables need bigger memory.
- **OLAP**: 1 GB – 4 GB.
- **Memory math**: only one operation at a time uses this per
  backend. Less of a risk than `work_mem`.
- **Risk if too high**: minimal — only one operation at a time.
- **Risk if too low**: slow `CREATE INDEX` on big tables; slow
  `VACUUM`.

### `effective_cache_size`

- **Question**: How much memory does the OS page cache have for
  this cluster's data?
- **Default**: 4 GB
- **OLTP**: 50–75% of RAM.
- **OLAP**: 75% of RAM.
- **Memory math**: this is a *hint*, not an allocation. Setting it
  doesn't allocate memory. The planner uses it to decide whether
  an index scan is cheaper than a seq scan.
- **Risk if too low**: planner picks seq scans when an index scan
  would be cached.
- **Risk if too high**: nothing — it doesn't allocate.

### `wal_buffers`

- **Question**: How much memory is the WAL scratch space?
- **Default**: auto, typically 16 MB
- **OLTP**: leave auto. The previous advice to set it to 16 MB
  explicitly is outdated.
- **Risk**: none in practice.

---

## WAL

### `wal_level`

- **Question**: What goes into the WAL?
- **Default**: `replica`
- **Production**: `replica` for streaming replication. `logical`
  if you use logical replication.
- **Risk**: setting it to `minimal` disables both streaming and
  logical replication. Setting to `logical` increases WAL volume
  by ~10–30%.

### `max_wal_senders`

- **Question**: How many replicas can connect?
- **Default**: 10
- **Production**: number of replicas + 1 (for monitoring tools).

### `wal_keep_size`

- **Question**: How much WAL to retain for replicas that fall
  behind?
- **Default**: 0 (depends on slots)
- **Production**: at least `2 * peak_wal_throughput_per_hour`. A
  busy cluster can write 100 GB of WAL/hour; this needs to be
  bigger than that to survive a 1-hour replica outage.
- **Alternative**: use replication slots (more reliable but they
  can fill the disk).

### `max_wal_size`

- **Question**: When should checkpoints happen?
- **Default**: 1 GB
- **OLTP**: 4–16 GB. Larger values mean fewer checkpoints, less
  recovery time, more peak I/O.
- **OLAP**: same.

### `checkpoint_completion_target`

- **Question**: Spread the checkpoint I/O over how much of the
  checkpoint interval?
- **Default**: 0.9
- **Production**: 0.9 (default). Lower values cause I/O spikes;
  higher values delay the next checkpoint.

---

## Replication

### `max_replication_slots`

- **Question**: How many replication slots can exist?
- **Default**: 10
- **Production**: number of logical replicas + a few for monitoring.
- **Risk if too low**: replicas can't connect.
- **Risk if too high**: WAL retention can balloon (see incident
  playbook #4).

### `hot_standby`

- **Question**: Can the replica serve reads while replaying?
- **Default**: `on` (since PG 10)
- **Production**: `on`. Read replicas are read replicas.

### `hot_standby_feedback`

- **Question**: Should the replica tell the primary about its
  queries?
- **Default**: `off`
- **Production**: `on` if you have long-running queries on the
  replica and want to prevent replay conflicts.
- **Risk if `on`**: a long query on the replica prevents vacuum
  cleanup on the primary.

---

## Connections

### `max_connections`

- **Question**: How many simultaneous connections?
- **Default**: 100
- **Production**: **200–500 maximum**. Beyond that, use pgBouncer.
- **Memory math**: each connection uses ~10 MB.
- **Risk if too high**: OOM, lock contention, slow planning.

### `superuser_reserved_connections`

- **Question**: Reserve connections for the superuser so the admin
  can always log in?
- **Default**: 3
- **Production**: 3–5.

### `idle_in_transaction_session_timeout`

- **Question**: How long can a session be `idle in transaction`?
- **Default**: 0 (forever)
- **Production**: `5min` or `10min`. Any longer is a bug.

---

## Cost model

These are the planner's knobs. Most workloads can leave them alone.

### `random_page_cost`

- **Question**: How expensive is a random disk read?
- **Default**: 4
- **Production (SSD/NVMe)**: 1.1. The default assumes spinning
  rust; on SSD, random and sequential are nearly the same.
- **Risk if too high**: planner picks seq scans.
- **Risk if too low**: planner picks nested loops with index scans
  for huge tables.

### `seq_page_cost`

- **Question**: How expensive is a sequential disk read?
- **Default**: 1
- **Production**: 1.

### `cpu_tuple_cost`

- **Question**: How expensive is processing one row?
- **Default**: 0.01
- **Production**: leave alone.

### `cpu_operator_cost`

- **Question**: How expensive is one operator?
- **Default**: 0.0025
- **Production**: leave alone.

### `effective_io_concurrency`

- **Question**: How many concurrent I/O requests can the disk
  subsystem handle?
- **Default**: 1 (HDD); 200 for SSD/NVMe
- **Production (SSD/NVMe)**: 200.
- **Production (HDD)**: 2–4.
- **Risk if too high**: no effect if the disk doesn't support it.

---

## Parallelism

### `max_parallel_workers_per_gather`

- **Question**: How many parallel workers can a single `Gather`
  node use?
- **Default**: 2
- **OLTP**: 0–2. Don't parallelize OLTP queries; they should be
  fast already.
- **OLAP**: 4–8.
- **Risk if too high**: parallel queries eat all cores.

### `max_parallel_workers`

- **Question**: Total parallel workers across all sessions?
- **Default**: 8
- **OLTP**: 8.
- **OLAP**: 16–32.
- **Risk if too high**: starvation.

### `max_parallel_maintenance_workers`

- **Question**: Workers for `CREATE INDEX` (non-`CONCURRENTLY`)?
- **Default**: 2
- **Production**: 2–4.

### `min_parallel_table_scan_size`

- **Question**: Minimum table size before parallel scan is
  considered?
- **Default**: 8 MB
- **Production**: 8 MB.

### `min_parallel_index_scan_size`

- **Question**: Minimum index size for parallel scan?
- **Default**: 512 KB
- **Production**: 512 KB.

---

## Autovacuum

### `autovacuum`

- **Question**: Is autovacuum on?
- **Default**: `on`
- **Production**: **`on`. Never off.**

### `autovacuum_max_workers`

- **Question**: How many autovacuum workers?
- **Default**: 3
- **Production**: 4–6 for a cluster with hundreds of tables.

### `autovacuum_naptime`

- **Question**: How often does the launcher wake up?
- **Default**: 60 s
- **Production**: 15–30 s. Smaller = more responsive.

### `autovacuum_vacuum_scale_factor`

- **Question**: Trigger vacuum when this fraction of the table is
  dead?
- **Default**: 0.2 (20%)
- **Production**: 0.05 – 0.1 globally; per-table overrides for
  hot tables.

### `autovacuum_analyze_scale_factor`

- **Question**: Trigger analyze when this fraction of the table
  is changed?
- **Default**: 0.1 (10%)
- **Production**: 0.05.

### `autovacuum_vacuum_cost_limit`

- **Question**: How much work can vacuum do per cycle?
- **Default**: 200
- **Production**: 1000–2000 on fast disks.

### `autovacuum_vacuum_cost_delay`

- **Question**: Sleep between cycles (ms)?
- **Default**: 2
- **Production**: 2 (with a high `cost_limit`, this lets vacuum
  catch up).

---

## Logging

### `log_min_duration_statement`

- **Question**: Log queries slower than this?
- **Default**: -1 (off)
- **Production**: 300 ms. Log slow queries.

### `log_lock_waits`

- **Question**: Log when a query waits for a lock?
- **Default**: `off`
- **Production**: `on`. Lock waits are bugs.

### `log_connections` / `log_disconnections`

- **Question**: Log every connection?
- **Default**: `off`
- **Production**: `on` for security auditing.

### `log_checkpoints`

- **Question**: Log checkpoint activity?
- **Default**: `off`
- **Production**: `on`.

### `auto_explain.log_min_duration`

- **Question**: Auto-log the EXPLAIN plan for queries slower than
  this?
- **Default**: -1 (off)
- **Production**: 500 ms – 1 s. Requires
  `shared_preload_libraries = 'auto_explain'`.

### `track_io_timing`

- **Question**: Measure per-I/O latency?
- **Default**: `off`
- **Production**: `on`. Adds a few % overhead but is gold for
  diagnosis.

---

## Statistics

### `default_statistics_target`

- **Question**: How detailed is each column's histogram?
- **Default**: 100
- **Production**: 100 – 1000. Higher = better estimates, slower
  `ANALYZE`.
- **Per-column override**: `ALTER TABLE t ALTER COLUMN c SET
  STATISTICS 1000;`

### `track_activities`, `track_counts`, `track_io_timing`

- **Question**: Collect activity/counts/IO stats?
- **Default**: `on` for activities and counts; `off` for IO
  timing
- **Production**: all on.

### `stats_temp_directory`

- **Question**: Where do stats files live?
- **Default**: `pg_stat_tmp`
- **Production**: leave alone. Move to a `tmpfs` if you have
  memory pressure.

---

## Security

### `password_encryption`

- **Question**: How are passwords hashed?
- **Default**: `scram-sha-256`
- **Production**: `scram-sha-256`. Never `md5`.

### `ssl`

- **Question**: Require SSL for connections?
- **Default**: `off`
- **Production**: `on` (with certificates).

### `ssl_min_protocol_version`

- **Question**: Minimum TLS version?
- **Default**: `TLSv1.2`
- **Production**: `TLSv1.2` minimum. `TLSv1.3` if all clients
  support it.

---

## Capstone: the docker-compose.yml in this repo

For reference, the values used in this curriculum's docker stack:

```
shared_buffers = 512 MB
effective_cache_size = 2 GB
work_mem = 32 MB
maintenance_work_mem = 256 MB
wal_level = replica
max_wal_senders = 10
wal_keep_size = 256 MB
shared_preload_libraries = pg_stat_statements
log_min_duration_statement = 300 ms
log_lock_waits = on
track_activities = on
track_io_timing = on
auto_explain.log_min_duration = 500 ms
```

These are starting points. For your workload, scale them up.

---

## The meta-rule

The defaults are good for a fresh cluster on a developer laptop.
For production:

1. Set `shared_buffers` to 25% of RAM.
2. Set `effective_cache_size` to 75% of RAM.
3. Set `random_page_cost` to 1.1 if you're on SSD.
4. Set `work_mem` based on the rule `work_mem * max_connections <
   25% of RAM`.
5. Set `maintenance_work_mem` to 256 MB or higher.
6. Turn on autovacuum tuning per-table for hot tables.
7. Set `log_min_duration_statement` to 300 ms.
8. Set `auto_explain.log_min_duration` to 500 ms.

After that, leave it alone and *measure*. Tuning without
measurement is superstition.
