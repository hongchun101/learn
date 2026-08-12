-- Exercise 28 — Scaling and Sharding
SET search_path = sql_core, public;

-- Q1: Set up a read-replica connection from the primary by creating
--     a postgres_fdw SERVER named 'replica_for_app' that points at
--     host='replica', port=5432, dbname=learning. Then create a
--     foreign table over pg_stat_activity on the replica. Run a
--     SELECT count(*) on it.

-- Q2: Use partitioning for a 100M-row events table; verify partition
--     pruning. Build a CREATE TABLE PARTITION BY RANGE (day) with
--     7 daily partitions; insert 1000 rows; EXPLAIN a query on
--     'day = today' and confirm only one partition is scanned.

-- Q3: Read pg_stat_replication. If empty, run scripts/setup-replica.sh
--     from another shell; re-read.

-- Q4: Read pg_stat_statements ordered by total_exec_time desc limit 5.
--     Identify the queries that would benefit most from a read replica.

-- Q5: Decide when NOT to shard (cite one or two hard reasons) — in
--     SQL comments.

-- Q6: Compute the read ratio for the cluster:
--     SELECT sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0)
--       FROM pg_statio_user_indexes;
--     A high ratio (> 0.99) suggests that the working set fits in
--     shared_buffers; a low ratio suggests a bigger box or sharding
--     is needed.
