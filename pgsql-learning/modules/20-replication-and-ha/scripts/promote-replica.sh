#!/usr/bin/env bash
# Module 20 — Promote replica + show new LSN on both sides.
set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPLICA_HOST="${REPLICA_HOST:-localhost}"
REPLICA_PORT="${REPLICA_PORT:-5433}"
PG_USER="${PG_USER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

echo "=== Primary LSN before promotion ==="
psql -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$PG_USER" -d learning -c "SELECT pg_current_wal_lsn();"

echo "=== Replica LSN before promotion ==="
psql -h "$REPLICA_HOST" -p "$REPLICA_PORT" -U "$PG_USER" -d learning -c "
  SELECT pg_last_wal_replay_lsn();
" || true

echo "=== Trigger pg_ctl promote (idempotent — only runs once on a replica) ==="
psql -h "$REPLICA_HOST" -p "$REPLICA_PORT" -U "$PG_USER" -d learning -c "
  SELECT pg_promote();
"

echo "=== Confirm new primary via promote_lsn ==="
psql -h "$REPLICA_HOST" -p "$REPLICA_PORT" -U "$PG_USER" -d learning -c "
  SELECT pg_last_wal_replay_lsn(), pg_is_in_recovery();
"
