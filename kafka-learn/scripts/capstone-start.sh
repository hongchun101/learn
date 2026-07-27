#!/usr/bin/env bash
# Start the three capstone services in the background.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/capstone/logs"
mkdir -p "$LOGS"

echo "==> Starting ingest (port 8081)"
java -jar "$ROOT/capstone/ingest/target/capstone-ingest-1.0.0.jar" \
  > "$LOGS/ingest.log" 2>&1 &
echo $! > "$LOGS/ingest.pid"

echo "==> Starting processor (port 8082)"
java -jar "$ROOT/capstone/processor/target/capstone-processor-1.0.0.jar" \
  > "$LOGS/processor.log" 2>&1 &
echo $! > "$LOGS/processor.pid"

echo "==> Starting api (port 8083)"
java -jar "$ROOT/capstone/api/target/capstone-api-1.0.0.jar" \
  > "$LOGS/api.log" 2>&1 &
echo $! > "$LOGS/api.pid"

sleep 15
echo "PIDs:"
cat "$LOGS"/*.pid
