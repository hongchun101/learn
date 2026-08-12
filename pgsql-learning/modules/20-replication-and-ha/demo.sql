-- Module 20 — Replication and HA
-- The stack assumes the docker-compose that boots primary + replica.
-- Many of these commands are run from outside the primary; see
-- scripts/setup-replica.sh and scripts/promote-replica.sh.
\echo === Module 20: Replication and HA ===
SET search_path = sql_core, public;

-- 20.1 Inspect WAL sender / receiver state on the primary
SELECT pid,
       client_addr,
       state,
       sync_state,
       sent_lsn,
       write_lsn,
       flush_lsn,
       replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS bytes_behind
  FROM pg_stat_replication;

-- 20.2 Replication slots (server-side cursors that pin WAL)
SELECT slot_name, plugin, slot_type, active, restart_lsn,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS bytes_pending
  FROM pg_replication_slots
 ORDER BY slot_name;

-- 20.3 Recovery state of any standby attached to this cluster
-- (returns zero rows on the primary)
SELECT pid, status, receive_start_lsn, receive_start_tli,
       written_lsn, flushed_lsn,
       received_tli,
       last_msg_send_time, last_msg_receipt_time,
       latest_end_lsn, latest_end_time
  FROM pg_stat_wal_receiver;
-- 20.4 Last replayed transaction timestamp on any attached standby
SELECT pg_last_wal_replay_lsn(),
       pg_last_xact_replay_timestamp(),
       now() - pg_last_xact_replay_timestamp() AS replay_age;

-- 20.5 Build a publication for logical replication
DROP PUBLICATION IF EXISTS all_tables;
DROP TABLE    IF EXISTS tt CASCADE;

CREATE TABLE tt (id int, val text);
INSERT INTO tt VALUES (1,'a'),(2,'b');
CREATE PUBLICATION all_tables FOR TABLE tt;

-- 20.6 List publications on this database
SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete,
       pubtruncate, pubviaroot
  FROM pg_publication;

-- 20.7 Publication tables
SELECT * FROM pg_publication_tables;

-- 20.8 Subscription inspection (would live on the replica)
-- Subscriptions only exist on the subscriber. The catalog query is
-- safe to run on either side.
SELECT subname, subenabled, subconninfo, subslotname, subsynccommit,
       subpublications
  FROM pg_subscription;

-- 20.9 Logical replication worker status (replica side)
-- Returns rows only when a subscription is actively applying.
SELECT pid, subid, subname, relid::regclass AS rel,
       received_lsn,
       last_msg_send_time, last_msg_receipt_time,
       latest_end_lsn, latest_end_time
  FROM pg_stat_subscription;

-- 20.10 Switchover playbook (READ-ONLY in this script; see scripts/)
-- 1. quiesce writes: pg_ctl pause  (or stop the application)
-- 2. wait for replica to catch up:
--    SELECT pg_last_wal_replay_lsn() = sent_lsn FROM pg_stat_replication;
-- 3. promote: pg_ctl promote -D <replica PGDATA>
-- 4. redirect clients to the new primary

-- 20.11 Read-only monitoring queries an SRE keeps on a dashboard
\echo --- active queries on the primary:
SELECT pid, application_name, state,
       (now() - query_start) AS query_age,
       left(query, 60) AS query_prefix
  FROM pg_stat_activity
 WHERE backend_type = 'client backend'
   AND state = 'active'
 ORDER BY query_start;

-- 20.12 Wait for replica to catch up to a target LSN (illustrative)
-- This is what a switchover script does before promoting.
DO $$
DECLARE
    target_lsn pg_lsn;
    current_lsn pg_lsn;
BEGIN
    SELECT sent_lsn INTO target_lsn FROM pg_stat_replication LIMIT 1;
    IF target_lsn IS NULL THEN
        RAISE NOTICE 'no replica attached; skip catch-up wait';
    ELSE
        FOR i IN 1..30 LOOP
            SELECT replay_lsn INTO current_lsn FROM pg_stat_replication LIMIT 1;
            EXIT WHEN current_lsn >= target_lsn OR current_lsn IS NULL;
            PERFORM pg_sleep(0.5);
        END LOOP;
        RAISE NOTICE 'replay_lsn = %, target = %', current_lsn, target_lsn;
    END IF;
END $$;

\echo === Module 20 complete ===
