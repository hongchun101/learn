-- Solutions 20 — Replication and HA
SET search_path = sql_core, public;

-- Q1 — every active replication connection with lag
SELECT pid, client_addr, state, sync_state,
       sent_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS bytes_behind
  FROM pg_stat_replication
 ORDER BY bytes_behind DESC NULLS LAST;

-- Q2 — every replication slot and its lag
SELECT slot_name, plugin, slot_type, active, restart_lsn,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS bytes_pending
  FROM pg_replication_slots
 ORDER BY bytes_pending DESC NULLS LAST;

-- Q3 — publication on a fresh table
DROP TABLE IF EXISTS repl_test;
CREATE TABLE repl_test (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payload text NOT NULL
);
DROP PUBLICATION IF EXISTS pub_for_replica;
CREATE PUBLICATION pub_for_replica FOR TABLE repl_test;
INSERT INTO repl_test (payload) VALUES
 ('one'),('two'),('three'),('four'),('five');

SELECT pubname, tablename
  FROM pg_publication_tables
 WHERE pubname = 'pub_for_replica';

-- Q4 — replica replay lag (in time and bytes)
SELECT now() - pg_last_xact_replay_timestamp() AS replay_age,
       pg_wal_lsn_diff(pg_current_wal_lsn(),
                       pg_last_wal_replay_lsn()) AS bytes_behind;

-- Q5 — list subscriptions (zero rows on the primary, N on the replica)
SELECT subname, subenabled, subconninfo, subslotname
  FROM pg_subscription;

-- Q6 — subscription workers
SELECT pid, status, received_lsn,
       last_msg_send_time, last_msg_receipt_time
  FROM pg_stat_subscription;

-- Q7 — pause + measure lag
BEGIN;
SELECT pg_sleep(2);
COMMIT;
-- Lag should remain small (sub-second) because no writes happened.
-- Repeat with an actual write inside the pause to see lag grow:
DO $$
BEGIN
    PERFORM pg_sleep(1);
    INSERT INTO repl_test (payload) SELECT 'burst-' || g
      FROM generate_series(1, 10000) g;
    PERFORM pg_sleep(1);
END $$;
-- After this block, bytes_behind should be measurable.

-- Q8 — CHECKPOINT and replica state
CHECKPOINT;
-- A CHECKPOINT forces the primary to flush dirty pages. The replica's
-- replay_lsn continues to advance as new WAL arrives. The replica's
-- restart_lsn (used by slots) may also advance.

-- Q9 — replication GUCs
SELECT name, setting, unit, short_desc
  FROM pg_settings
 WHERE name IN ('wal_level','max_wal_senders','max_replication_slots',
                'hot_standby','hot_standby_feedback',
                'synchronous_standby_names','wal_receiver_timeout',
                'wal_retrieve_retry_interval','wal_sender_timeout')
 ORDER BY name;

-- Q10 — switchover playbook (text answer):
-- A switchover is a *planned* primary change. The replica is healthy
-- and caught up. Steps:
--
-- 1. Quiesce writes:
--      - Stop the application's write traffic, OR
--      - Use pg_ctl pause to refuse new transactions on the primary.
-- 2. Wait for the replica to catch up:
--      SELECT pg_last_wal_replay_lsn() = sent_lsn FROM pg_stat_replication;
--    or, equivalently:
--      SELECT pg_wal_lsn_diff(sent_lsn, replay_lsn) = 0;
-- 3. Promote the replica:
--      pg_ctl promote -D /path/to/replica/PGDATA
--    (or `SELECT pg_promote();` from inside psql on the replica).
-- 4. Update the application's connection strings to point at the
--    new primary. Or use a virtual IP / connection router.
-- 5. Resume writes.
--
-- A *failover* is the unplanned version: the primary is dead.
-- Steps are the same minus the pause-and-wait; you take whatever
-- replica has the highest replay_lsn and promote it.
