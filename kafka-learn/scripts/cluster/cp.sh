#!/usr/bin/env bash
# Print a classpath suitable for `java -cp` of one module.
# Usage:  source cp.sh l1-fundamentals
#         java -cp "$(module_cp l1-fundamentals)" com.kafkalearn.l1.HelloProducer
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

module_cp() {
  local m="$1"
  local module_dir="$ROOT/modules/$m"
  if [ ! -d "$module_dir" ]; then
    module_dir="$ROOT/$m"
  fi
  local deps
  deps=$(cd "$module_dir" && mvn -B -ntp -q dependency:build-classpath -Dmdep.outputFile=/tmp/_kl-cp.txt -Dmdep.includeScope=runtime 2>&1 | tail -1)
  echo "$module_dir/target/classes:$module_dir/target/test-classes:$ROOT/common/target/classes:$(cat /tmp/_kl-cp.txt 2>/dev/null || true)"
}
