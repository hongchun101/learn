#!/usr/bin/env bash
# Print a one-line health summary of the local cluster.
set -euo pipefail
BS="${KAFKA_BOOTSTRAP_SERVERS:-localhost:19092,localhost:29092,localhost:39092}"

echo "Bootstrap: $BS"

for port in 19092 29092 39092; do
  if (echo > /dev/tcp/localhost/$port) >/dev/null 2>&1; then
    echo "  broker on :$port — UP"
  else
    echo "  broker on :$port — DOWN"
  fi
done

if curl -fsS http://localhost:18081/subjects >/dev/null 2>&1; then
  echo "  schema-registry :18081 — UP"
else
  echo "  schema-registry :18081 — DOWN"
fi

if curl -fsS http://localhost:18083/connectors >/dev/null 2>&1; then
  echo "  connect         :18083 — UP"
else
  echo "  connect         :18083 — DOWN"
fi

if curl -fsS http://localhost:9000/api/health >/dev/null 2>&1; then
  echo "  kafdrop         :9000  — UP"
else
  echo "  kafdrop         :9000  — DOWN"
fi
