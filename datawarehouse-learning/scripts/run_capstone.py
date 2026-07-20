"""End-to-end capstone runner.

Loads the demo dataset, runs the full layered pipeline (ODS -> DWD
-> DWS -> DWT -> ADS) against DuckDB, prints summary KPIs, and
runs the DQ assertions from `shared/data_quality.py`.

Run:
    python shared/generate_data.py --scale small
    python scripts/run_capstone.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from shared.data_quality import evaluate_sql, orders_rules, user_events_rules
from shared.sql_runner import SqlRunner

DATA = ROOT / "data" / "small"
CONTRACT = (ROOT / "sql-contract" / "reference_duckdb.sql").read_text(encoding="utf-8")


def banner(msg: str) -> None:
    print()
    print("=" * 70)
    print(f"  {msg}")
    print("=" * 70)


def main() -> int:
    t0 = time.perf_counter()
    banner("Step 1/4 · Load demo dataset into DuckDB")
    r = SqlRunner(":memory:", DATA)
    print(f"  loaded in {time.perf_counter() - t0:.2f}s")

    banner("Step 2/4 · Run the full layered pipeline (ODS -> DWD -> DWS -> DWT -> ADS)")
    r.run_script(CONTRACT)
    print(f"  built in {time.perf_counter() - t0:.2f}s")

    banner("Step 3/4 · Print KPI summary")
    kpis = [
        ("ODS row count: orders",      "SELECT COUNT(*) FROM ods.orders"),
        ("DWD row count: orders",      "SELECT COUNT(*) FROM dwd.orders"),
        ("DWS row count: user_order_1d", "SELECT COUNT(*) FROM dws.user_order_1d"),
        ("DWT row count: user_topic",  "SELECT COUNT(*) FROM dwt.user_topic"),
        ("ADS row count: gmv_daily",   "SELECT COUNT(*) FROM ads.gmv_daily"),
        ("ADS row count: user_rfm",    "SELECT COUNT(*) FROM ads.user_rfm"),
        ("ADS row count: daily_kpi",   "SELECT COUNT(*) FROM ads.daily_kpi"),
        ("Total GMV",                  "SELECT ROUND(SUM(gmv),2) FROM ads.gmv_daily"),
        ("Total users",                "SELECT COUNT(DISTINCT user_id) FROM ads.user_rfm"),
        ("SCD-2 dim_user_scd2 rows",   "SELECT COUNT(*) FROM dim.user_scd2"),
    ]
    for label, sql in kpis:
        v = r.fetchone(sql)[0]
        print(f"  {label:35s} {v}")

    banner("Step 4/4 · Data quality assertions")
    for rs_name, rs, table in [
        ("orders", orders_rules(), "ods.orders"),
        ("user_events", user_events_rules(), "ods.user_events"),
    ]:
        bad = evaluate_sql(rs, r, table)
        if bad.empty:
            print(f"  {rs_name:15s} OK ({len(rs.rules)} rules, 0 violations)")
        else:
            print(f"  {rs_name:15s} FAIL\n{bad.to_string(index=False)}")
            return 1

    print()
    print("=" * 70)
    print(f"  CAPSTONE OK  ({time.perf_counter() - t0:.2f}s)")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
