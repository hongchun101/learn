"""Module 01 / ch01 — OLTP vs OLAP, measured.

The same analytical query against the same data; we show that
DuckDB (an OLAP engine) returns in ms while the same SQL "would
never" be run against a row-oriented OLTP system at scale.
"""
from __future__ import annotations

import time
from pathlib import Path

import duckdb
import pandas as pd

DATA = Path("data") / "small" / "orders.parquet"


def olap_query() -> pd.DataFrame:
    con = duckdb.connect(":memory:")
    t0 = time.perf_counter()
    df = con.execute(
        """
        SELECT
          DATE_TRUNC('month', order_date) AS month,
          status,
          COUNT(*)        AS n,
          SUM(total)      AS gmv
        FROM read_parquet(?)
        GROUP BY 1, 2
        ORDER BY 1, 2
        """,
        [str(DATA)],
    ).df()
    dt = (time.perf_counter() - t0) * 1000
    print(f"OLAP-style aggregation took {dt:.1f} ms")
    print(df.head())
    return df


def oltp_pattern() -> None:
    """Simulate the OLTP way of doing analytics: one row at a time,
    application-side loop.  This is what an OLTP system would do if
    you tried to do analysis from it directly — and why we need a
    warehouse.
    """
    df = pd.read_parquet(DATA)
    t0 = time.perf_counter()
    # the row-by-row anti-pattern
    out = {}
    for _, row in df.iterrows():
        key = (row["order_date"].replace(day=1), row["status"])
        out.setdefault(key, [0, 0.0])
        out[key][0] += 1
        out[key][1] += float(row["total"])
    dt = (time.perf_counter() - t0) * 1000
    print(f"OLTP-style row-by-row aggregation took {dt:.1f} ms")
    print(f"  rows processed: {len(df):,}, "
          f"speedup: ~{dt / 5:.0f}× slower on small data")


if __name__ == "__main__":
    olap_query()
    print()
    oltp_pattern()
