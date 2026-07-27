#!/usr/bin/env bash
# Describe a consumer group's lag.
# Usage:  ./describe-group.sh <group>
set -euo pipefail
GROUP="${1:-}"
if [ -z "$GROUP" ]; then echo "usage: $0 <group>" >&2; exit 1; fi
BS="${KAFKA_BOOTSTRAP_SERVERS:-localhost:19092,localhost:29092,localhost:39092}"

if command -v kafka-consumer-groups.sh >/dev/null 2>&1; then
  exec kafka-consumer-groups.sh --bootstrap-server "$BS" --describe --group "$GROUP"
fi

if docker ps --format '{{.Names}}' | grep -q '^kl-kafka-1$'; then
  exec docker exec kl-kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh \
    --bootstrap-server kafka-1:19092 --describe --group "$GROUP"
fi

echo "neither kafka-consumer-groups.sh nor a running kl-kafka-1 container found" >&2
exit 1
