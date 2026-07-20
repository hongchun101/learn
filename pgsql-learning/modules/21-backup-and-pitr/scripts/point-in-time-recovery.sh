#!/usr/bin/env bash
# Module 21 — PITR playbook (educational runbook).
# Run from the host; assumes setup-archive.sh has been run and the base
# backup is at ./data/base_backup.

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

TARGET_LSN="${TARGET_LSN:-0/3000000}"      # change me to a real LSN
TARGET_TIMELINE="${TARGET_TIMELINE:-1}"

echo "=== Create recovery configuration ==="
RECOVERY_DIR=./data/recovery_pitr
rm -rf "$RECOVERY_DIR"
mkdir -p "$RECOVERY_DIR"

cp -r ./data/base_backup/* "$RECOVERY_DIR/"
chmod -R u+rwx "$RECOVERY_DIR"

cat >> "$RECOVERY_DIR/postgresql.auto.conf" <<EOF
restore_command = 'cp ${PWD}/data/wal_archive/%f %p'
recovery_target_lsn = '${TARGET_LSN}'
recovery_target_timeline = '${TARGET_TIMELINE}'
EOF

touch "$RECOVERY_DIR/recovery.signal"

echo "=== Start the recovery process (interactive via docker compose) ==="
echo "Then run:"
echo "  docker compose -f docker/docker-compose.yml run --rm -v \$(pwd)/data:/data recovery \\"
echo "    postgres -D /data/recovery_pitr"
echo "=== Verify the recovered data ==="
echo "  psql -h localhost -p 5434 -U postgres -d learning -c 'SELECT * FROM row_demo'"
