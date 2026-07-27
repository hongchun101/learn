#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/capstone/logs"
for f in "$LOGS"/*.pid; do
  [ -f "$f" ] || continue
  pid=$(cat "$f")
  echo "stopping $pid"
  kill "$pid" 2>/dev/null || true
  rm -f "$f"
done
