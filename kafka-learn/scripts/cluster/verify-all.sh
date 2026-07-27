#!/usr/bin/env bash
# Verify every lab from L1..L7 + capstone.
# Pre-req: docker compose up -d; brokers healthy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# 1. Build once
mvn -B -ntp -DskipTests -f "$ROOT/pom.xml" package

# 2. Run each lab
bash "$ROOT/scripts/labs/l1.sh"
bash "$ROOT/scripts/labs/l2.sh"
bash "$ROOT/scripts/labs/l3.sh"
bash "$ROOT/scripts/labs/l4.sh"
bash "$ROOT/scripts/labs/l5.sh"
bash "$ROOT/scripts/labs/l6.sh"
bash "$ROOT/scripts/labs/l7.sh"

# 3. Capstone (manual)
echo "==> Capstone requires manual smoke (see docs/08-capstone.md)"
