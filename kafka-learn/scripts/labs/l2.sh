#!/usr/bin/env bash
# L2 lab — internals
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CP="$(ls "$ROOT"/modules/l2-internals/target/dependency/*.jar 2>/dev/null | tr '\n' ':')$ROOT/modules/l2-internals/target/classes:$ROOT/common/target/classes"

echo "==> 1. Inspect log segments (low/high watermark per partition)"
java -cp "$CP" com.kafkalearn.l2.SegmentInspector l1.greetings

echo
echo "==> 2. Consumer-group lag (L1 left an offset behind)"
java -cp "$CP" com.kafkalearn.l2.ReplicaLagDemo l1.greetings l1-hello

echo
echo "==> 3. Watch leaders for 15s.  In another shell: docker stop kl-kafka-2"
java -DdurationMs=15000 -DpollMs=2000 -cp "$CP" com.kafkalearn.l2.LeaderWatcher l1.greetings

echo
echo "==> 4. Replay rebalance (start two of these in parallel shells)"
echo "java -DdurationMs=30000 -cp $CP com.kafkalearn.l2.GroupRebalanceDemo"
