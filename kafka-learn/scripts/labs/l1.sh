#!/usr/bin/env bash
# L1 lab — produce + consume + describe.
#
# Prereq: docker compose up -d, brokers are healthy, mvn -B -ntp -DskipTests package
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../cluster/cp.sh
. "$ROOT/scripts/cluster/cp.sh"
CP="$(module_cp l1-fundamentals)"

echo "==> 1. Create topic + send 10 records"
java -cp "$CP" com.kafkalearn.l1.HelloProducer 10

echo
echo "==> 2. Describe topic partitions"
java -cp "$CP" com.kafkalearn.l1.PartitionExplorer l1.greetings

echo
echo "==> 3. Consume 10 records"
java -Dcount=10 -DtimeoutMs=15000 \
     -cp "$CP" com.kafkalearn.l1.HelloConsumer

echo
echo "==> Lab complete."
