#!/usr/bin/env bash
# Run a single module's demo + solution + problem against the primary.
# Usage: scripts/verify-module.sh 01

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.yml}"

cd "$(dirname "$0")/.."
module_id="${1:-}"
test -n "$module_id" || { echo "usage: $0 <NN>"; exit 2; }

run() {
    local name="$1"; shift
    local file
    file=$(ls "$@" 2>/dev/null || true)
    if [ -z "$file" ]; then
        echo "skip $name (no file)"
        return 0
    fi
    echo "=== $name: $file ==="
    docker compose -f "$COMPOSE_FILE" exec -T primary \
        psql -U "$PG_USER" -d learning -v ON_ERROR_STOP=on -X -f "$file" || true
}

run demo "modules/${module_id}-"*/demo.sql
run solution "exercises/solutions/${module_id}-"*.sql
run problem "exercises/${module_id}-"*.sql

echo "done."
