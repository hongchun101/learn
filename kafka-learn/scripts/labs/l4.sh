#!/usr/bin/env bash
# L4 lab — Streams
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CP="$(ls "$ROOT"/modules/l4-streams/target/dependency/*.jar 2>/dev/null | tr '\n' ':')$ROOT/modules/l4-streams/target/classes:$ROOT/common/target/classes"

echo "==> 1. Word count (run in one shell)"
java -cp "$CP" com.kafkalearn.l4.WordCountStream &

echo "==> 2. Stream-table enrichment (run in one shell)"
java -cp "$CP" com.kafkalearn.l4.ClickStreamEnrichment &

echo "==> 3. Session windows (run in one shell)"
java -cp "$CP" com.kafkalearn.l4.SessionWindowedStream &

wait
