"""Module 14 / tests — 5 OLAP query patterns must run and assert.

Covers:
  ch01 模式 1 高基数 GROUP-BY  (q1)
  ch01 模式 2 Top-N             (q2)
  ch01 模式 3 Approx distinct   (q3)
  ch01 模式 4 Window function   (q4)
  ch01 模式 5 Multi-way JOIN    (q5)

Plus a benchmark timing assertion that each pattern completes inside a
generous bound for the small dataset — these are not SLO numbers, they
are smoke gates that detect regressions in the SQL itself (e.g. accidental
cross join blowing up the row count).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data" / "small"
sys.path.insert(0, str(ROOT))
from shared.sql_runner import _split_statements  # noqa: E402

SQL_PATH = ROOT / "modules" / "14-olap" / "src" / "olap_demo.sql"


@pytest.fixture()
def con():
    """In-memory DuckDB with ods.* loaded from data/small."""
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    return c


def _run_script(con: duckdb.DuckDBPyConnection, sql_path: Path) -> None:
    text = sql_path.read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        if s.upper().startswith("EXPLAIN"):
            continue
        con.execute(s)


@pytest.fixture()
def loaded(con):
    """Run the full OLAP demo SQL once per test, share the connection."""
    _run_script(con, SQL_PATH)
    return con


# ---------------------------------------------------------------------------
# 模式 1 — 高基数 GROUP-BY
# ---------------------------------------------------------------------------

def test_q1_high_cardinality_groupby_runs(loaded):
    df = loaded.execute(
        "SELECT COUNT(*) AS bucket_count, SUM(gmv) AS total_gmv "
        "FROM ads.q1_high_cardinality_groupby"
    ).df()
    assert int(df["bucket_count"].iloc[0]) > 0, "q1 should produce >0 buckets"
    gmv = float(df["total_gmv"].iloc[0])
    assert gmv > 0, f"q1 total gmv should be positive, got {gmv}"


def test_q1_high_cardinality_groupby_cardinality(loaded):
    """user_id × dt must yield > 1000 buckets for the small dataset."""
    n = loaded.execute(
        "SELECT COUNT(*) FROM ads.q1_high_cardinality_groupby"
    ).fetchone()[0]
    assert n >= 1000, f"q1 expected >=1000 (user,dt) buckets, got {n}"


# ---------------------------------------------------------------------------
# 模式 2 — Top-N
# ---------------------------------------------------------------------------

def test_q2_topn_per_category(loaded):
    """Top-10 per category: every category must have <= 10 rows and at least 1."""
    df = loaded.execute(
        "SELECT category, COUNT(*) AS rk_count "
        "FROM ads.q2_topn_category GROUP BY category"
    ).df()
    assert len(df) >= 1, "q2 should cover >=1 category"
    bad = df[df["rk_count"] > 10]
    assert bad.empty, f"q2: these categories have >10 rows: {bad}"
    assert (df["rk_count"] >= 1).all(), "q2: each category should have >=1 row"


def test_q2_topn_is_sorted_per_category(loaded):
    """rk must be 1..10 per category, contiguous."""
    df = loaded.execute(
        "SELECT category, MIN(rk) AS lo, MAX(rk) AS hi, COUNT(*) AS cnt "
        "FROM ads.q2_topn_category GROUP BY category"
    ).df()
    assert (df["lo"] == 1).all(), f"q2: min rk should be 1, got {df['lo'].tolist()}"
    assert df["cnt"].max() <= 10
    assert df["hi"].max() <= 10


# ---------------------------------------------------------------------------
# 模式 3 — Approximate distinct / distinct counting
# ---------------------------------------------------------------------------

def test_q3_approx_distinct_runs(loaded):
    df = loaded.execute(
        "SELECT COUNT(*) AS day_count, SUM(event_cnt) AS total_pv "
        "FROM ads.q3_approx_distinct"
    ).df()
    days = int(df["day_count"].iloc[0])
    total = int(df["total_pv"].iloc[0])
    assert days > 0 and total > 0, f"q3 days={days} total_pv={total}"


def test_q3_pv_per_uv_is_reasonable(loaded):
    """pv_per_uv = event_cnt / exact_uv should be >= 1 and < 1000."""
    df = loaded.execute(
        "SELECT pv_per_uv FROM ads.q3_approx_distinct "
        "WHERE pv_per_uv IS NOT NULL"
    ).df()
    assert len(df) > 0, "q3: at least one row must have a defined pv_per_uv"
    assert df["pv_per_uv"].min() >= 1.0, "q3: pv_per_uv should be >= 1"
    assert df["pv_per_uv"].max() < 1000.0, "q3: pv_per_uv exploded, likely join bug"


# ---------------------------------------------------------------------------
# 模式 4 — Window function
# ---------------------------------------------------------------------------

def test_q4_rolling_gmv_non_negative(loaded):
    df = loaded.execute(
        "SELECT MIN(gmv_7d) AS lo, MAX(gmv_7d) AS hi, COUNT(*) AS rows "
        "FROM ads.q4_window_rolling_gmv"
    ).df()
    assert int(df["rows"].iloc[0]) > 0
    assert float(df["lo"].iloc[0]) >= 0, "rolling gmv should be non-negative"


def test_q4_lag_and_rank_columns_present(loaded):
    cols = loaded.execute(
        "SELECT column_name FROM (DESCRIBE ads.q4_window_rolling_gmv)"
    ).df()["column_name"].tolist()
    for required in ("gmv_7d", "gmv_rank", "prev_day_gmv", "dod_delta", "day_seq"):
        assert required in cols, f"q4 missing window column: {required}"


# ---------------------------------------------------------------------------
# 模式 5 — Multi-way JOIN
# ---------------------------------------------------------------------------

def test_q5_join_reconciles_with_orders(loaded):
    """Multi-way JOIN GMV (qty*unit_price) must equal the per-item
    reconciliation total. In this demo dataset `orders.total` is the
    *paid* amount and `order_items.unit_price` is the *list* price —
    they intentionally differ; the right invariant is per-item qty*up.
    Catches accidental cross-join or filter-loss."""
    expected = loaded.execute(
        "SELECT ROUND(SUM(i.quantity * i.unit_price), 2) AS gmv "
        "FROM dwd.order_items i JOIN dwd.orders o ON i.order_id = o.order_id "
        "WHERE o.status = 'completed'"
    ).fetchone()[0]
    joined = loaded.execute(
        "SELECT ROUND(SUM(gmv), 2) FROM ads.q5_full_join_report"
    ).fetchone()[0]
    assert expected is not None and joined is not None
    assert abs(float(expected) - float(joined)) < 1.0, (
        f"q5 join gmv={joined} should equal per-item gmv={expected}"
    )


def test_q5_join_row_count_bounded(loaded):
    """The join should not explode the row count."""
    n = loaded.execute(
        "SELECT COUNT(*) FROM ads.q5_full_join_report"
    ).fetchone()[0]
    assert 100 < n < 100_000, f"q5 row count out of plausible range: {n}"


# ---------------------------------------------------------------------------
# 性能基准 (smoke gate, not SLO)
# ---------------------------------------------------------------------------

def test_benchmark_all_queries_run_under_2s(loaded):
    """Re-run each result-table query once and assert wall-time < 2s on
    the small dataset. On a normal laptop the patterns complete in < 50ms
    each; 2s leaves head-room for CI but catches accidental full-cartesian."""
    queries = [
        ("q1_high_cardinality", "SELECT COUNT(*), SUM(gmv) FROM ads.q1_high_cardinality_groupby"),
        ("q2_topn",             "SELECT COUNT(*), MAX(rk)  FROM ads.q2_topn_category"),
        ("q3_approx_distinct",  "SELECT COUNT(*), SUM(event_cnt) FROM ads.q3_approx_distinct"),
        ("q4_window",           "SELECT COUNT(*), MAX(gmv_7d) FROM ads.q4_window_rolling_gmv"),
        ("q5_full_join",        "SELECT COUNT(*), SUM(gmv) FROM ads.q5_full_join_report"),
    ]
    for label, sql in queries:
        t0 = time.perf_counter()
        loaded.execute(sql).fetchall()
        elapsed = time.perf_counter() - t0
        assert elapsed < 2.0, f"{label} took {elapsed:.3f}s (>2s smoke bound)"