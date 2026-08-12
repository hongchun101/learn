-- Exercise 20 — Replication and HA
SET search_path = sql_core, public;

-- Q1: List every active replication connection. For each, show the
--     client_addr, sync_state, and the bytes_behind
--     (pg_wal_lsn_diff(sent_lsn, replay_lsn)). Order by bytes_behind
--     desc.

-- Q2: List every replication slot and its lag
--     (bytes_pending = pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)).
--     For each slot, also show whether it is currently active.

-- Q3: Build a publication named 'pub_for_replica' on a table called
--     'repl_test' with columns (id bigint, payload text). Insert 5
--     rows. Confirm the publication shows in pg_publication_tables.

-- Q4: Compute the replica replay lag in seconds:
--     SELECT now() - pg_last_xact_replay_timestamp();
--     And in bytes:
--     SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),
--                            pg_last_wal_replay_lsn());

-- Q5: List every subscription on this database
--     (zero rows on the primary; one row per subscription on the replica).

-- Q6: Show the workers of any subscription (zero rows on the primary).

-- Q7: Pause writes for 2 seconds (pg_sleep in a transaction), then
--     measure the replica lag during the pause. Describe what you
--     observe.

-- Q8: Run a CHECKPOINT on the primary. Describe how this affects the
--     replica replay position.

-- Q9: Read every replication-related GUC:
--     wal_level, max_wal_senders, max_replication_slots,
--     hot_standby, hot_standby_feedback, synchronous_standby_names,
--     wal_receiver_timeout, wal_retrieve_retry_interval.

-- Q10: In SQL comments, write out the steps of a switchover from the
--      current primary to a replica.
