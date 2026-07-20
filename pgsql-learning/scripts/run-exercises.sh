#!/usr/bin/env bash
# Walk every solution + problem statement (no answer key) and let students
# see the plan / output.

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.yml}"

cd "$(dirname "$0")/.."

run_many() {
    local header="$1"; shift
    echo "=== $header ==="
    for f in "$@"; do
        echo "--- $f ---"
        docker compose -f "$COMPOSE_FILE" exec -T primary \
            psql -U "$PG_USER" -d learning -v ON_ERROR_STOP=off -X -f "$f" || true
    done
}

run_many "solutions"          exercises/solutions/*.sql
run_many "exercise problems"  exercises/[0-9]*.sql
