#!/usr/bin/env bash
# Cluster smoke test — checks the cluster is healthy before
# running any lab.
set -euo pipefail
BS="${KAFKA_BOOTSTRAP_SERVERS:-localhost:19092,localhost:29092,localhost:39092}"

# Lightweight TCP probe:  open + close is enough to know the broker
# is listening.  Replace with a real protocol probe if you want
# to be paranoid.
for port in 19092 29092 39092; do
  if ! (echo > /dev/tcp/localhost/$port) >/dev/null 2>&1; then
    echo "broker on port $port not reachable" >&2
    exit 1
  fi
done

echo "✓ all 3 brokers are listening"
echo "  bootstrap: $BS"
