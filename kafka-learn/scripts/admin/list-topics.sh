#!/usr/bin/env bash
# List all topics on the local cluster.  Requires the Kafka CLI
# to be available (e.g. from a local Kafka install, or via
# `docker exec kl-kafka-1 /opt/kafka/bin/kafka-topics.sh --list`).
set -euo pipefail
BS="${KAFKA_BOOTSTRAP_SERVERS:-localhost:19092,localhost:29092,localhost:39092}"

# If we have a kafka-topics binary, use it; otherwise call via docker.
if command -v kafka-topics.sh >/dev/null 2>&1; then
  exec kafka-topics.sh --bootstrap-server "$BS" --list
fi

if docker ps --format '{{.Names}}' | grep -q '^kl-kafka-1$'; then
  exec docker exec kl-kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:19092 --list
fi

echo "neither kafka-topics.sh nor a running kl-kafka-1 container found" >&2
exit 1
