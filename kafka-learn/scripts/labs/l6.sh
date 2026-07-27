#!/usr/bin/env bash
# L6 lab — operations
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CP="$(ls "$ROOT"/modules/l6-operations/target/dependency/*.jar 2>/dev/null | tr '\n' ':')$ROOT/modules/l6-operations/target/classes:$ROOT/common/target/classes"

echo "==> 1. Throughput benchmark (200k records, 512B payload)"
java -cp "$CP" com.kafkalearn.l6.ThroughputBenchmark

echo
echo "==> 2. Admin tool (nodes + groups + lag)"
java -cp "$CP" com.kafkalearn.l6.AdminTool

echo
echo "==> 3. Chaos test (kill kl-kafka-2 in another shell)"
java -DdurationMs=90000 -cp "$CP" com.kafkalearn.l6.ChaosTest &

echo "==> 4. Prometheus scrape endpoint"
java -cp "$CP" com.kafkalearn.l6.PrometheusScrapeEndpoint

wait
