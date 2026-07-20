#!/usr/bin/env bash
# Module 22 — Snapshot statistical views into a JSON file.
# Run from outside the database (host side).

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

OUT=./data/snapshots/$(date -u +%Y%m%dT%H%M%SZ).json
mkdir -p ./data/snapshots

psql -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$PG_USER" -d learning \
    -X -A -t -F '|' <<SQL > "$OUT"
SELECT 'pg_stat_database'        AS section, datname, numbackends, xact_commit, xact_rollback, blks_read, blks_hit FROM pg_stat_database;
SELECT 'pg_stat_activity',       state, count(*) FROM pg_stat_activity GROUP BY state;
SELECT 'pg_stat_user_tables',    relname, seq_scan, idx_scan, n_live_tup, n_dead_tup FROM pg_stat_user_tables;
SELECT 'pg_stat_statements',     substring(query for 80), calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 25;
SELECT 'pg_replication_slots',   slot_name, active, restart_lsn FROM pg_replication_slots;
SELECT 'pg_locks_summary',       mode, granted, count(*) FROM pg_locks GROUP BY mode, granted;
SELECT 'pg_stat_replication',    application_name, state, sync_state, sent_lsn, replay_lsn FROM pg_stat_replication;
SQL

echo "Wrote: $OUT"
