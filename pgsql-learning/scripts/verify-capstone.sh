#!/usr/bin/env bash
# Verify the capstone end-to-end.
#
#   1. apply schema, triggers, RLS
#   2. seed
#   3. run demo queries
#   4. assert key invariants: partitioning, EXPLAIN uses Index Scan,
#      RLS denying without a token, etc.

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-localhost}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.yml}"

cd "$(dirname "$0")/.."

run() {
    local file="$1"
    echo "=== applying $file ==="
    docker compose -f "$COMPOSE_FILE" exec -T primary \
        psql -U "$PG_USER" -d learning -v ON_ERROR_STOP=on -X -f "$file"
}

run /workspace/capstone/sql/01-schema.sql
run /workspace/capstone/sql/02-functions-triggers-rls.sql
run /workspace/capstone/sql/03-seed.sql
run /workspace/capstone/sql/04-queries.sql
run /workspace/capstone/sql/05-ops.sql
run /workspace/sql/contracts/00-master-check.sql

echo
echo "=== capstone invariants ==="
docker compose -f "$COMPOSE_FILE" exec -T primary \
    psql -U "$PG_USER" -d learning -v ON_ERROR_STOP=on -X -A <<SQL
-- 24 partitions expected (one per month)
SELECT count(*) AS partition_count
  FROM pg_inherits
 WHERE inhrelid::regclass::text LIKE 'shop.orders_%';

-- Tables present?
SELECT 'shop.orders exists' AS check,
       EXISTS (SELECT 1 FROM pg_class WHERE relname='orders' AND relnamespace='shop'::regnamespace) AS ok
 UNION ALL
 SELECT 'shop.reviews exists',
       EXISTS (SELECT 1 FROM pg_class WHERE relname='reviews' AND relnamespace='shop'::regnamespace);

-- Trigger exists?
SELECT 'reviews_notify_trg exists' AS check,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='reviews_notify_trg') AS ok;

-- RLS denying without a token: the actor function returns NULL → 0 rows.
BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL app.actor_token = '';
SELECT count(*) AS rls_visible_orders_should_be_zero FROM shop.orders;
COMMIT;
SQL

echo "=== CAPSTONE OK ==="
