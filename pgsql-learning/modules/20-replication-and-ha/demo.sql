-- Module 20 — Replication and HA
-- The stack assumes the docker-compose that boots primary + replica.
-- These commands are meant to be run from outside the primary, in scripts/.
\echo === Module 20: Replication and HA ===

\echo === 20.1 Inspect WAL sender and receiver state (on primary) ===
SELECT pid,
       client_addr,
       state,
       sync_state,
       sent_lsn,
       replay_lsn
  FROM pg_stat_replication;

\echo === 20.2 Set up replication slot (optional) ===
SELECT slot_name, plugin, slot_type, active, restart_lsn
  FROM pg_replication_slots;

\echo === 20.3 Logical replication: subscription/publisher declarations ===
DROP PUBLICATION IF EXISTS all_tables CASCADE;
DROP TABLE    IF EXISTS tt CASCADE;

CREATE TABLE tt (id int, val text);
INSERT INTO tt VALUES (1,'a'),(2,'b');
CREATE PUBLICATION all_tables FOR TABLE tt;

\echo === 20.4 Subscriptions live on the subscriber ===
\echo --- (these commands run on the REPLICA, not the primary)
-- CREATE SUBSCRIPTION subs_all FROM PUBLICATION all_tables ;
\echo --- Apply workload, then read back the replication state.

\echo === 20.5 Switchover playbook (READ ONLY in this script) ===
\echo --- 1. quiesce writes: pg_ctl pause
\echo --- 2. wait for replica to catch up: SELECT pg_last_wal_replay_lsn()
\echo --- 3. promote: pg_ctl promote -D <replica PGDATA>
\echo --- 4. redirect clients to the new primary

\echo === 20.6 Read-only monitoring ===
\echo --- SELECT * FROM pg_stat_replication;
\echo --- SELECT now() - pg_last_xact_replay_timestamp();

\echo === Module 20 complete ===
