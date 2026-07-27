#!/usr/bin/env bash
# Capstone smoke test — POSTs events to the ingest service and
# queries the API for results.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Waiting for ingest / processor / api to be UP"
for port in 8081 8082 8083; do
  until curl -fs "http://localhost:$port/actuator/health" >/dev/null; do
    sleep 2
  done
done

echo "==> POSTing 200 click events"
for i in $(seq 1 200); do
  user="u$((RANDOM % 20))"
  url="/p/$((RANDOM % 5))"
  curl -fs -X POST http://localhost:8081/ingest/click \
    -H 'Content-Type: application/json' \
    -d "{\"user_id\":\"$user\",\"url\":\"$url\",\"referrer\":\"google\",\"session\":\"s-$((RANDOM % 30))\"}" \
    >/dev/null
done

echo
echo "==> Sleeping 70s for the 1-minute window to close"
sleep 70

echo
echo "==> Top 10 users"
curl -s http://localhost:8083/api/top-users?n=10

echo
echo "==> Top 10 URLs"
curl -s http://localhost:8083/api/top-urls?n=10

echo
echo "==> Total sessions"
curl -s http://localhost:8083/api/sessions/total
