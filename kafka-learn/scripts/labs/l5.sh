#!/usr/bin/env bash
# L5 lab — Ecosystem
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CP="$(ls "$ROOT"/modules/l5-ecosystem/target/dependency/*.jar 2>/dev/null | tr '\n' ':')$ROOT/modules/l5-ecosystem/target/classes:$ROOT/common/target/classes"

echo "==> 1. Avro producer (auto-registers schema in SR)"
java -cp "$CP" com.kafkalearn.l5.AvroProducer

echo
echo "==> 2. Protobuf producer"
java -cp "$CP" com.kafkalearn.l5.ProtobufProducer

echo
echo "==> 3. Connect REST API"
java -cp "$CP" com.kafkalearn.l5.ConnectClient

echo
echo "==> 4. MirrorMaker 2 reference config printed to console"
java -cp "$CP" -e "" 2>/dev/null || \
  java -cp "$CP" com.kafkalearn.l5.MirrorMaker2Config || true
