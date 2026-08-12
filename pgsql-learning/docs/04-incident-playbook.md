# 04 — Incident Playbook

> 15 production incidents every PostgreSQL expert must be able to
> diagnose in their sleep. For each: symptom, first-three-checks,
> root cause, fix, and how to prevent it next time.

This document assumes the curriculum modules are done. It does not
re-explain MVCC, WAL, or vacuum — those are the *theory*. This
document is the *practice*.

## How to use this document

When the pager fires:

1. Don't read the whole playbook. Read the **First three checks**
   for the symptom you have.
2. Run them in order. Each takes under a minute.
3. The first check that doesn't match expected output tells you which
   scenario you're in.
4. Read that scenario's **Root cause** and **Fix**.

The playbook is ordered by **frequency**. The most common
incidents come first.

---

## 1. "The application is slow"

### Symptom
Latency p95 is up. CPU on the database server is normal or low. The
application team is paging.

### First three checks

```sql
-- Check 1: is there a runaway query right now?
SELECT pid, now() - query_start AS dur, left(query, 80) AS q
  FROM pg_stat_activity
 WHERE state = 'active' AND backend_type = 'client backend'
 ORDER BY query_start
 LIMIT 5;

-- Check 2: is the run-of-the-mill workload slow or is it one query?
SELECT substring(query for 80) AS query,
       calls,
       round(mean_exec_time::numeric, 1) AS mean_ms,
       round(total_exec_time::numeric, 1) AS total_ms
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 10;

-- Check 3: is the lock manager congested?
SELECT mode, granted, count(*)
  FROM pg_locks GROUP BY 1, 2 ORDER BY 3 DESC;
```

### Root cause

The most likely cause, in order:

1. **One query is suddenly slow because its plan changed.** Run
   `EXPLAIN (ANALYZE, BUFFERS)` on the query. Look at the difference
   vs the plan you remember from before. If you don't have a "plan
   from before", run `auto_explain` and read `pg_log`.
2. **A new query is suddenly flooding the cluster.** Check 2 above.
3. **Lock contention.** Check 3 above. The lock that has many
   `granted=false` is the bottleneck.
4. **`work_mem` is too small for the actual workload.** The plan
   shows `external merge Disk` or `HashAgg spilled to disk`.

### Fix

- Identify the query. `pg_stat_activity` gives you the current
  offender; `pg_stat_statements` gives you the all-time offender.
- Kill it if it's a runaway:
  `SELECT pg_cancel_backend(<pid>);` — polite.
  `SELECT pg_terminate_backend(<pid>);` — force.
- If the plan changed, run `ANALYZE` on the table, then re-EXPLAIN.
  If the plan is still wrong, drop the bad index, run `VACUUM
  ANALYZE`, recreate the index.
- If lock contention: find the holder, ask "are you in the middle
  of a long transaction?" If yes, fix the long transaction.
- If `work_mem` is too small: tune it. Default is 4 MB. A typical
  OLTP query can use up to 32–128 MB.

### Prevention

- `log_min_duration_statement = 300ms` (we set this in the stack).
- `auto_explain.log_min_duration = 500ms`.
- A weekly review of `pg_stat_statements`.

---

## 2. "The application is down"

### Symptom
Connection refused, or queries time out. Pager.

### First three checks

```bash
# Check 1: is the server up?
docker compose -f docker/docker-compose.yml ps primary
docker compose -f docker/docker-compose.yml exec primary pg_isready -U postgres

# Check 2: is the WAL stuck?
docker compose -f docker/docker-compose.yml exec primary \
  psql -U postgres -d postgres -c \
  "SELECT pg_current_wal_lsn(), pg_last_wal_replay_lsn();"

# Check 3: is the connection pool exhausted?
docker compose -f docker/docker-compose.yml exec primary \
  psql -U postgres -d postgres -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

### Root cause

In order:

1. **Connection pool exhausted.** The most common cause: a
   deployment opened too many connections, or a long-running
   transaction is holding them. `pg_stat_activity` shows
   `idle in transaction` for the offenders. Kill them.
2. **Replication lag → failover didn't happen.** Replica is `pg_is_in_recovery()` but nothing took over.
3. **Disk full.** The WAL can't be written, so the cluster hangs.
4. **`max_connections` reached.** Same symptom as #1 but the cause
   is the GUC, not the pooler.

### Fix

- If pool exhausted: kill idle-in-transaction sessions.
  ```sql
  SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
   WHERE state = 'idle in transaction'
     AND now() - xact_start > interval '5 minutes';
  ```
- If disk full: archive old WAL, drop old backups. Set
  `log_directory` rotation.
- If `max_connections` reached: use pgBouncer transaction pooling.
  This is not optional at scale.

### Prevention

- pgBouncer. Always.
- Alert on `count(*) FROM pg_stat_activity WHERE state = 'idle in transaction' AND now() - xact_start > 60s`.
- Alert on disk usage > 80%.

---

## 3. "Replication lag is growing"

### Symptom
The replica is seconds or minutes behind the primary. Reads are
stale.

### First three checks

```sql
-- Check 1: how far behind?
SELECT client_addr, state, sync_state,
       sent_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS bytes_behind,
       now() - pg_last_xact_replay_timestamp() AS replay_age
  FROM pg_stat_replication;

-- Check 2: is the replica replaying anything?
SELECT pid, state, wait_event_type, wait_event,
       now() - pg_last_xact_replay_timestamp() AS replay_age
  FROM pg_stat_activity
 WHERE backend_type = 'walreceiver';

-- Check 3: are there long-running queries on the replica?
SELECT pid, now() - query_start AS dur, left(query, 80) AS q
  FROM pg_stat_activity
 WHERE backend_type = 'client backend' AND state = 'active'
 ORDER BY query_start LIMIT 5;
```

### Root cause

In order:

1. **A long-running query on the replica is blocking replay.** This
   is the **single most common** cause. The replica uses
   `hot_standby_feedback = off` (the default); a long SELECT
   conflicts with WAL replay and the WAL applier waits.
2. **Network is slow.** Check `bytes_behind` *and* `replay_age`.
   Big `bytes_behind` + low `replay_age` = network is the bottleneck.
3. **Replica is overloaded.** `vmstat`, `iostat` on the replica.
4. **`max_replication_slots` filled up.** The replica can't catch
   up because the WAL it needs was recycled.

### Fix

- Long query: kill it. Find the application's offending query.
- Network: talk to your network engineer.
- Slots: free a slot, or `pg_replication_slot_advance`.

### Prevention

- `log_min_duration_statement` on the replica, too.
- Alert on `pg_last_xact_replay_timestamp()` older than 30s.
- Test failover regularly. A replica you have never failed over is
  not a replica.

---

## 4. "Queries that used to be fast are now slow"

### Symptom
Yesterday this query ran in 50 ms. Today it runs in 5 s. Nothing
changed in the schema.

### First three checks

```sql
-- Check 1: did the plan change?
EXPLAIN (ANALYZE, BUFFERS) <the query>;

-- Check 2: are stats stale?
SELECT relname, last_analyze, last_autoanalyze,
       n_mod_since_analyze
  FROM pg_stat_user_tables
 WHERE relname = '<table>';

-- Check 3: did bloat grow?
SELECT relname, n_live_tup, n_dead_tup,
       pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_stat_user_tables
 WHERE relname = '<table>';
```

### Root cause

In order:

1. **Statistics are stale.** The data distribution changed but
   `ANALYZE` didn't run yet. `n_mod_since_analyze > 100000` is the
   threshold.
2. **The table bloated.** `n_dead_tup` is huge, the table is 5x the
   size it should be, and vacuum didn't keep up.
3. **A migration changed the schema.** Check the migration log.
4. **A new index appeared.** Sometimes the planner picks the new
   index for queries it shouldn't.

### Fix

- Run `ANALYZE <table>;` and re-EXPLAIN.
- If the table is bloated, run `VACUUM (ANALYZE)` first, then
  `REINDEX` the index. Only `VACUUM FULL` rewrites the heap; that's
  a lock.
- If a migration caused it, roll back the migration.

### Prevention

- Don't disable autovacuum.
- Don't disable `track_counts`.
- Run `ANALYZE` after every bulk load.

---

## 5. "Disk usage is climbing"

### Symptom
The disk is at 85% and growing.

### First three checks

```sql
-- Check 1: which tables are biggest?
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_stat_user_tables
 ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;

-- Check 2: how much WAL is on disk?
SELECT count(*), pg_size_pretty(sum(size)::bigint) AS total
  FROM pg_ls_waldir();

-- Check 3: is the archive working?
SELECT last_archived_time, last_failed_time,
       last_archived_wal, last_failed_wal
  FROM pg_stat_archiver;
```

### Root cause

In order:

1. **A table or index is bloated.** Run a per-table-size query;
   bloat is when the table is much larger than `n_live_tup * row_width`.
2. **WAL is not being archived.** If `archive_mode = on` and
   `archive_command` is failing, WAL files stay in `pg_wal` forever.
3. **Old backups not pruned.**
4. **Logging not rotated.**

### Fix

- Bloat: `VACUUM FULL` (with care), or `pg_repack` (online).
- WAL archive: fix the `archive_command`. Test it by hand.
- Backups: prune old `pg_basebackup` outputs.

### Prevention

- Alert on disk > 80%.
- Alert on `pg_stat_archiver.last_failed_time` recent.
- Prune backups weekly.

---

## 6. "The replica won't start"

### Symptom
Replica container is up but `pg_is_in_recovery()` is `false` and
the WAL replay is at 0.

### First three checks

```bash
# Check 1: container logs
docker compose -f docker/docker-compose.yml logs replica --tail 50

# Check 2: is primary reachable?
docker compose -f docker/docker-compose.yml exec replica \
  psql "host=primary user=postgres password=postgres dbname=learning" -c "SELECT 1"

# Check 3: is primary_key in recovery.signal?
docker compose -f docker/docker-compose.yml exec replica \
  cat /var/lib/postgresql/data/recovery.signal
```

### Root cause

In order:

1. **Network between primary and replica is broken.**
2. **The replica PGDATA is older than `wal_keep_size`.** WAL files
   the replica needs were recycled on the primary.
3. **The primary's `pg_hba.conf` doesn't allow the replica's
   `repl` user.**
4. **`max_wal_senders` is exhausted.**

### Fix

- Network: fix it.
- WAL retention: increase `wal_keep_size`, or set up a replication
  slot.
- pg_hba: add the line.
- Senders: increase `max_wal_senders`.

### Prevention

- Use replication slots in production (with monitoring — runaway
  slots cause incidents themselves).
- Test failover. *Test* failover.

---

## 7. "Deadlock detected"

### Symptom
Application logs `ERROR: deadlock detected`.

### First three checks

```sql
-- Check 1: which transactions are waiting?
SELECT pg_locks.pid, pg_locks.locktype, pg_locks.mode,
       pg_locks.granted, pg_stat_activity.query
  FROM pg_locks
  JOIN pg_stat_activity ON pg_stat_activity.pid = pg_locks.pid
 WHERE NOT pg_locks.granted;

-- Check 2: what was the query at the time?
SELECT datname, pid, left(query, 200) AS q
  FROM pg_stat_activity
 WHERE state IN ('active', 'idle in transaction');

-- Check 3: how often is this happening?
SELECT datname, deadlocks FROM pg_stat_database WHERE datname = current_database();
```

### Root cause

Deadlocks are not bugs — they're a property of concurrent
transactions acquiring locks in different orders. The cure is one
of:

1. **Always acquire locks in the same order.** Application code
   change.
2. **Reduce lock granularity.** Use `FOR UPDATE SKIP LOCKED` or
   finer-grained rows.
3. **Retry on `40P01`.** Wrap the transaction in a retry loop.

### Fix

- Add retry logic. Most ORMs have a setting for this.
- Re-examine the transaction. Is it holding a write lock on row A
  while waiting for row B?

### Prevention

- Order all UPDATEs by primary key.
- Wrap transactions in retry loops.
- Use `SELECT … FOR UPDATE SKIP LOCKED` for queues.

---

## 8. "Vacuum is not keeping up"

### Symptom
`n_dead_tup` is growing. The table is bloated. Queries are slow.

### First three checks

```sql
-- Check 1: how many dead tuples?
SELECT relname, n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup, 0), 1) AS pct_dead
  FROM pg_stat_user_tables
 WHERE n_live_tup > 0
 ORDER BY n_dead_tup DESC LIMIT 10;

-- Check 2: when did vacuum last run?
SELECT relname, last_autovacuum, last_autoanalyze
  FROM pg_stat_user_tables
 ORDER BY last_autovacuum NULLS FIRST LIMIT 10;

-- Check 3: is autovacuum running?
SHOW autovacuum;
SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%autovacuum%';
```

### Root cause

In order:

1. **`autovacuum_vacuum_scale_factor` is too high.** Default is
   0.2 (20% dead tuples trigger vacuum). For a busy table, lower it
   to 0.05 or even 0.02.
2. **`autovacuum_vacuum_cost_limit` is too low.** Default is 200.
   On a fast disk, bump it to 1000 or 2000.
3. **`autovacuum_max_workers` is too low.** Default is 3. For a
   cluster with many tables, raise it.
4. **The table has a long-running transaction preventing vacuum
   from cleaning up.**

### Fix

```sql
ALTER TABLE big_table SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_cost_limit = 1000
);
```

Or globally, in `postgresql.conf`:
```
autovacuum_vacuum_scale_factor = 0.05
autovacuum_vacuum_cost_limit = 2000
autovacuum_max_workers = 6
```

### Prevention

- Monitor `n_dead_tup` as a percentage of `n_live_tup`.
- Alert when it exceeds 20% on any table.

---

## 9. "xid wraparound emergency"

### Symptom
Logs say `WARNING: database "X" must be vacuumed within N transactions`.
Or worse, the cluster refuses writes.

### First three checks

```sql
-- Check 1: the wraparound horizon
SELECT datname, age(datfrozenxid) AS xid_age,
       (2^31 - 200000000 - age(datfrozenxid)) AS xids_remaining
  FROM pg_database WHERE datistemplate = false
 ORDER BY age(datfrozenxid) DESC;

-- Check 2: per-table freeze age
SELECT relname, age(relfrozenxid)
  FROM pg_class
 WHERE relkind IN ('r', 't')
 ORDER BY age(relfrozenxid) DESC LIMIT 10;

-- Check 3: are vacuums running?
SELECT count(*) FROM pg_stat_activity WHERE query ILIKE '%vacuum%';
```

### Root cause

If `xids_remaining` is below 10 million: **act now**. Run
`VACUUM FREEZE` on the oldest tables. If below 1 million: **call for
help**. The cluster will refuse writes when `xids_remaining = 0`.

### Fix

```sql
-- Emergency freeze on the oldest table
VACUUM FREEZE VERBOSE big_table;

-- If even that won't work: single-user mode
-- pg_ctl -D $PGDATA -m immediate stop
-- postgres --single -D $PGDATA learning
-- VACUUM FREEZE;
-- Then start the server normally.
```

### Prevention

- Monitor `age(datfrozenxid)` cluster-wide.
- Alert at 200 million.
- Don't disable autovacuum, ever.

---

## 10. "Out of memory (OOM) killer"

### Symptom
Postgres process is gone. `dmesg` shows `oom-killer killed postgres`.

### First three checks

```bash
# Check 1: was it OOM?
dmesg | grep -i oom

# Check 2: how much memory was allocated?
grep -i 'out of memory\|cannot allocate' $PGLOG

# Check 3: which queries were running?
docker compose exec primary cat /var/lib/postgresql/data/log/postgresql-*.log | tail -200
```

### Root cause

In order:

1. **`work_mem` too high per query.** If you have 100 connections
   and `work_mem = 256MB`, that's 25 GB allocated.
2. **`shared_buffers` too high.** Don't set it above 25% of RAM.
3. **`maintenance_work_mem` too high.** Same multiplier.
4. **A specific query is consuming unbounded memory** (sort, hash).

### Fix

- Reduce `work_mem`. 16–64 MB is reasonable.
- Reduce `shared_buffers` if it's > 25% of RAM.
- Identify the query and fix it.

### Prevention

- `work_mem` * 200 connections < RAM.
- `shared_buffers` < 25% RAM.
- `effective_cache_size` is a hint, not memory; set it freely.

---

## 11. "Connection refused"

### Symptom
Application says "could not connect to server".

### First three checks

```bash
# Check 1: is the server up?
pg_isready -h <host> -p 5432

# Check 2: is the port open?
nc -zv <host> 5432

# Check 3: does pg_hba allow this user?
# (the application should tell you; otherwise check logs)
```

### Root cause

1. **Server is down.** Check `pg_isready`, check the logs.
2. **`pg_hba.conf` denies the connection.** Check
   `pg_hba_file_rules` on the server.
3. **`listen_addresses` is set to `localhost` only.** Edit
   `postgresql.conf`.
4. **Wrong port.** The application is connecting to 5432 but the
   server is on 5433.

### Fix

Each one above has its own fix. Always remember: `pg_hba.conf` is
reloaded with `pg_ctl reload`. `postgresql.conf` requires a
restart.

---

## 12. "Replication slot is falling behind"

### Symptom
A consumer (logical replica, BDR, Debezium) is hours behind.

### First three checks

```sql
SELECT slot_name, active, restart_lsn,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS bytes_behind
  FROM pg_replication_slots
 ORDER BY pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) DESC;
```

### Root cause

1. **The consumer is slow.** Its `apply` worker can't keep up.
2. **The primary is generating WAL faster than the consumer can
   apply it.**
3. **A long-running transaction is preventing slot advance.**

### Fix

- Find the consumer's slow queries and fix them.
- Increase `max_replication_slots` if you're out of slots.
- If the slot is *inactive* (consumer disconnected), drop it.

### Prevention

- Alert on `bytes_behind > 1GB` per slot.
- Never let a slot be inactive for long. Either consume or drop.

---

## 13. "Sequences are exhausted"

### Symptom
`ERROR: nextval: reached maximum value of sequence "X"`.

### Root three checks

```sql
SELECT sequencename, last_value
  FROM pg_sequences WHERE last_value > 0
 ORDER BY last_value DESC LIMIT 10;
```

### Root cause

You used `smallint` or `integer` for the sequence's underlying
type. With billions of rows, `integer` is not enough.

### Fix

```sql
ALTER SEQUENCE big_seq AS bigint;
```

If the sequence has already wrapped, you need a bigger type. New
rows will use the new range.

### Prevention

- Always use `bigint` for surrogate keys.
- Use `GENERATED ALWAYS AS IDENTITY` — it picks the right type by
  default.

---

## 14. "Hot row contention"

### Symptom
A small number of rows are being updated very frequently. The
cluster is "slow" but no single query is slow.

### First three checks

```sql
-- Check 1: which rows are hot?
SELECT relname, n_tup_upd, n_tup_hot_upd, n_live_tup
  FROM pg_stat_user_tables
 ORDER BY n_tup_upd DESC LIMIT 10;

-- Check 2: how many waiters?
SELECT count(*) FROM pg_locks WHERE NOT granted;

-- Check 3: tail latency on the hot table
SELECT pid, now() - query_start AS dur, wait_event_type, wait_event, left(query, 80)
  FROM pg_stat_activity
 WHERE state = 'active' AND query ILIKE '%hot_table%';
```

### Root cause

A row is being updated by every request. The lock serializes all
those requests.

### Fix

- **Sharding the hot row.** "Counter" pattern: row id 1, 2, 3 each
  holding a counter; pick one at random.
- **Application-level queue.** If the contention is for "next job
  to process", use `SELECT … FOR UPDATE SKIP LOCKED`.
- **Move the hot row to Redis or another store.** Postgres is not
  the right tool for atomic counters at high frequency.

### Prevention

- Identify hot rows *before* they become hot. Look at `pg_stat_user_tables`.

---

## 15. "Migration is taking forever / locking out writes"

### Symptom
`ALTER TABLE ADD COLUMN` or `CREATE INDEX` is blocking all writes.

### First three checks

```sql
-- Check 1: what lock is held?
SELECT relation::regclass, mode, granted, count(*)
  FROM pg_locks GROUP BY 1, 2, 3 ORDER BY 4 DESC;

-- Check 2: what's running?
SELECT pid, now() - query_start AS dur, left(query, 80) FROM pg_stat_activity WHERE state = 'active';

-- Check 3: what GUCs affect this migration?
-- CREATE INDEX: maintenance_work_mem
-- ALTER TABLE ADD COLUMN: usually none, since PG 11 it doesn't rewrite the table unless DEFAULT is non-null
```

### Root cause

In order:

1. **The migration took an `ACCESS EXCLUSIVE` lock.** Many
   migrations don't need it; some do.
2. **The migration is rewriting the table.** `ALTER TABLE ALTER
   COLUMN TYPE`, for example, rewrites everything.
3. **`maintenance_work_mem` is too small**, so `CREATE INDEX` is
   sorting to disk.

### Fix

- For `ALTER TABLE ADD COLUMN` with a constant default: PG 11+
  doesn't rewrite the table. Verify by reading the docs.
- For `CREATE INDEX`: use `CREATE INDEX CONCURRENTLY` in production.
- For type changes: use the new `ALTER TABLE … ALTER COLUMN …
  USING …` with care, or do it in batches.

### Prevention

- Never run a destructive migration in production without testing
  it on a copy first.
- `CREATE INDEX CONCURRENTLY` is your friend. Always.

---

## Summary — the meta-incident

The biggest incident of all is **the one you didn't anticipate**.
The way to anticipate is:

1. **Read every `pg_log` line** at least once a week.
2. **Run `pg_stat_statements` reviews** at least once a week.
3. **Have alerts** on: disk, wraparound, replication lag, dead
   tuples, OOM.
4. **Test failover and restore** at least once a quarter.
5. **Read the manual's "Compatibility" and "Release Notes"** before
   every major version upgrade.

If you do those five things, you will see most incidents coming
before they happen.
