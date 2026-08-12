#!/usr/bin/env bash
# Run every module's demo.sql against the primary. Idempotent.

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

DB="learning"
COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.yml}"

cd "$(dirname "$0")/.."

failed=0
ran=0

run_one() {
    local module_id="$1"
    local file
    file=$(ls "modules/${module_id}-"*/demo.sql 2>/dev/null || true)
    if [ -z "$file" ]; then
        echo "skip $module_id (no demo.sql)"
        return 0
    fi
    if docker compose -f "$COMPOSE_FILE" exec -T primary \
            psql -U "$PG_USER" -d "$DB" -v ON_ERROR_STOP=on -X -f "$file" > /dev/null; then
        echo "ok   $module_id"
    else
        echo "FAIL $module_id"
        failed=$((failed + 1))
    fi
    ran=$((ran + 1))
}

for i in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28; do
    run_one "$i"
done

echo
echo "=== ${ran} module(s) run, ${failed} failed ==="
test "$failed" -eq 0 || exit 1
