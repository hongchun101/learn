#!/usr/bin/env bash
# L7 lab — expert
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CP="$(ls "$ROOT"/modules/l7-expert/target/dependency/*.jar 2>/dev/null | tr '\n' ':')$ROOT/modules/l7-expert/target/classes:$ROOT/common/target/classes"

echo "==> 1. Set/clear quota on user=evil"
java -cp "$CP" com.kafkalearn.l7.QuotaEnforcer

echo
echo "==> 2. ACL admin"
java -cp "$CP" com.kafkalearn.l7.AclAdmin

echo
echo "==> 3. KRaft deep dive (watch controller).  In another shell: docker stop kl-kafka-1"
java -DdurationMs=60000 -cp "$CP" com.kafkalearn.l7.KRaftDeepDive

echo
echo "==> 4. EOS end-to-end (read-process-write)"
java -cp "$CP" com.kafkalearn.l7.EosEndToEnd
