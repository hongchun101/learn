#!/usr/bin/env bash
# Module 21 — Set up archive_command + base backup.

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-./data/wal_archive}"
mkdir -p "$WAL_ARCHIVE_DIR"

echo "=== Configure WAL archive on primary ==="
psql -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$PG_USER" -d learning <<SQL
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET archive_mode = on;
ALTER SYSTEM SET archive_command = 'test ! -f ${PWD}/${WAL_ARCHIVE_DIR}/%f && cp %p ${PWD}/${WAL_ARCHIVE_DIR}/%f';
ALTER SYSTEM SET archive_timeout = '60s';
SELECT pg_reload_conf();
SQL

echo "=== Take a base backup ==="
pg_basebackup -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" \
    -U "$PG_USER" -D "./data/base_backup" \
    -Ft -z -P -X stream

echo "=== List the base backup contents ==="
ls -lh ./data/base_backup
