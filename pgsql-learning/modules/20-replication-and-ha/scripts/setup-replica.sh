#!/usr/bin/env bash
# Module 20 — Streaming replication setup.
#
# This script runs from outside the primary container. It expects
# docker compose to already have started primary + replica.

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPLICA_HOST="${REPLICA_HOST:-localhost}"
REPLICA_PORT="${REPLICA_PORT:-5433}"
PG_USER="${PG_USER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

echo "=== Configure primary ==="
psql -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$PG_USER" -d learning <<'SQL'
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET wal_keep_size = '256MB';
SELECT pg_reload_conf();
SQL

echo "=== Create base backup and ship to replica ==="
rm -rf data/replica_initdata
mkdir -p data/replica_initdata

pg_basebackup \
    --host="$PRIMARY_HOST" --port="$PRIMARY_PORT" \
    --username="$PG_USER" --pgdata=data/replica_initdata \
    --wal-method=stream --checkpoint=fast \
    --progress --verbose

cat > data/replica_initdata/postgresql.auto.conf <<EOF
primary_conninfo = 'host=$PRIMARY_HOST port=$PRIMARY_PORT user=$PG_USER password=postgres application_name=replica'
hot_standby = on
EOF

touch data/replica_initdata/standby.signal

echo "=== Promote this backup to a replica via the docker compose replica service ==="
echo "=== (move the data dir into the replica container; demo only) ==="
