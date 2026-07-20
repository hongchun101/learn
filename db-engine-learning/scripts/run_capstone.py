"""Run the capstone end-to-end.

Default scale is 100. Increase via the CLI: `python scripts/run_capstone.py 1000`.
"""
from __future__ import annotations

import json
import sys
import time

from db_engine.modules.module_18_capstone import QUERIES, build_tpch_lite, run_q


def main(scale: int = 100) -> int:
    print(f"Building TPC-H-lite catalog at scale={scale}...")
    t0 = time.perf_counter()
    cat = build_tpch_lite(scale)
    build_ms = (time.perf_counter() - t0) * 1000
    print(f"  build took {build_ms:.1f} ms")

    print(f"Running {len(QUERIES)} queries...")
    grand_total = 0.0
    failures: list[str] = []
    for name, sql in QUERIES.items():
        t = time.perf_counter()
        r = run_q(name, sql, cat)
        elapsed = (time.perf_counter() - t) * 1000
        grand_total += elapsed
        status = "OK"
        if r["rows"] <= 0:
            status = "EMPTY"
            failures.append(name)
        print(f"  [{status}] {name}: rows={r['rows']} elapsed={elapsed:.1f} ms")

    print(f"\nTotal elapsed: {grand_total:.1f} ms (build {build_ms:.1f} ms)")

    if failures:
        print(f"  WARNING: {len(failures)} queries returned 0 rows: {failures}")
        return 1
    print("\nCAPSTONE OK")
    return 0


if __name__ == "__main__":
    scale = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    sys.exit(main(scale))
