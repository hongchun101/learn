#!/usr/bin/env bash
# L3 lab — reliability
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CP="$(ls "$ROOT"/modules/l3-reliability/target/dependency/*.jar 2>/dev/null | tr '\n' ':')$ROOT/modules/l3-reliability/target/classes:$ROOT/common/target/classes"

echo "==> 1. acks latency/safety tradeoff (1000 records each)"
java -cp "$CP" com.kafkalearn.l3.AcksDemo

echo
echo "==> 2. Idempotent producer"
java -cp "$CP" com.kafkalearn.l3.IdempotentProducer

echo
echo "==> 3. Transactional transfer (debit + credit, atomic)"
java -cp "$CP" com.kafkalearn.l3.TransactionalTransfer

echo
echo "==> 4. Process-then-commit consumer"
java -cp "$CP" com.kafkalearn.l3.ProcessAndCommit
