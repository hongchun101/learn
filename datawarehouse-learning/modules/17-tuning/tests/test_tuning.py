"""Tests for Module 17 — Tuning.

These tests do NOT measure raw execution time (the demo data set is too small
for stable wall-clock measurements). Instead they assert the *contract* that
makes the layout/plan optimisations behave:

1. The full `tuning_demo.sql` script runs to completion without errors and
   materialises every layout.
2. Reordering rows (`ORDER BY` during CREATE TABLE … AS SELECT) preserves the
   logical row set — every physical layout reports the same row count and the
   same filtered aggregates as the unsorted source.  This is the correctness
   precondition for any pruning / bucketing speed-up claim.
3. The skewed layout actually concentrates rows on `user_id = 1` — the
   prerequisite for the data-skew section of the demo to be meaningful.
4. The summary view exposes every layout so downstream consumers (notebooks,
   Capstone) can query a single entry point.
"""
from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from shared.sql_runner import _split_statements  # noqa: E402

DATA = ROOT / "data" / "small"
SQL_FILE = ROOT / "modules" / "17-tuning" / "src" / "tuning_demo.sql"


@pytest.fixture()
def con():
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    return c


def _run_script(con, sql_path: Path) -> None:
    text = sql_path.read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        if s.upper().startswith("EXPLAIN"):
            continue
        con.execute(s)


# ──────────────────────────────────────────────────────────────────────
# 1. The full demo script executes cleanly.
# ──────────────────────────────────────────────────────────────────────
def test_demo_script_runs_without_error(con):
    """Every statement in tuning_demo.sql must execute on a fresh in-memory DB."""
    _run_script(con, SQL_FILE)


# ──────────────────────────────────────────────────────────────────────
# 2. All layouts exist and report the same row count as the source.
#    Without this invariant the partition-pruning claim is meaningless —
#    sorting must not drop or duplicate rows.
# ──────────────────────────────────────────────────────────────────────
def test_layouts_preserve_row_count(con):
    _run_script(con, SQL_FILE)
    source_rows = con.execute("SELECT COUNT(*) FROM ods.orders").fetchone()[0]
    assert source_rows > 0, "fixture parquet must be non-empty"

    layouts = [
        "dwt.orders_unsorted",
        "dwt.orders_by_date",
        "dwt.orders_by_user",
        "dwt.orders_compound",
        "dwt.orders_skewed",
    ]
    for tbl in layouts:
        n = con.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        assert n == source_rows, f"{tbl} row count {n} != source {source_rows}"


# ──────────────────────────────────────────────────────────────────────
# 3. Filtered aggregates are layout-independent.
#    A date-range filter must yield identical COUNT/SUM whether rows are
#    sorted, clustered, or skewed.  Also: the skewed table must actually
#    concentrate rows on user_id=1 (the precondition for the skew demo).
# ──────────────────────────────────────────────────────────────────────
def test_filtered_aggregates_are_layout_invariant(con):
    _run_script(con, SQL_FILE)

    date_sql = """
        SELECT COUNT(*) AS c, SUM(total) AS s
        FROM {tbl}
        WHERE order_date BETWEEN DATE '2024-03-01' AND DATE '2024-03-31'
    """
    unsorted_c, unsorted_s = con.execute(date_sql.format(tbl="dwt.orders_unsorted")).fetchone()
    by_date_c, by_date_s = con.execute(date_sql.format(tbl="dwt.orders_by_date")).fetchone()
    compound_c, compound_s = con.execute(date_sql.format(tbl="dwt.orders_compound")).fetchone()

    assert unsorted_c == by_date_c == compound_c > 0, (
        f"date-range COUNT must match across layouts: "
        f"unsorted={unsorted_c} by_date={by_date_c} compound={compound_c}"
    )
    # SUM may differ in the last bits due to floating-point summation order;
    # compare within 1 cent of relative tolerance to keep the test stable
    # without weakening the correctness invariant.
    for label, got in (("by_date", by_date_s), ("compound", compound_s)):
        assert abs(unsorted_s - got) <= max(1e-3, abs(unsorted_s) * 1e-9), (
            f"date-range SUM diverged from unsorted: unsorted={unsorted_s} {label}={got}"
        )

    user_sql = "SELECT COUNT(*), SUM(total) FROM {tbl} WHERE user_id = 42"
    u_unsorted_c, u_unsorted_s = con.execute(user_sql.format(tbl="dwt.orders_unsorted")).fetchone()
    u_by_user_c, u_by_user_s = con.execute(user_sql.format(tbl="dwt.orders_by_user")).fetchone()
    assert u_unsorted_c == u_by_user_c, (
        f"user-filter COUNT must match: unsorted={u_unsorted_c} by_user={u_by_user_c}"
    )
    assert abs(u_unsorted_s - u_by_user_s) <= max(1e-3, abs(u_unsorted_s) * 1e-9), (
        f"user-filter SUM diverged: unsorted={u_unsorted_s} by_user={u_by_user_s}"
    )

    # Skew precondition: user_id=1 owns the majority of rows.
    hot, total = con.execute(
        "SELECT COUNT(*) FILTER (WHERE user_id = 1), COUNT(*) "
        "FROM dwt.orders_skewed"
    ).fetchone()
    assert total > 0
    assert hot > total // 2, (
        f"skewed layout not actually skewed: hot={hot} total={total}"
    )


# ──────────────────────────────────────────────────────────────────────
# 4. The summary view exposes every layout so the rest of the curriculum
#    can introspect what this module built (used by Module 18 Capstone).
# ──────────────────────────────────────────────────────────────────────
def test_summary_view_exposes_all_layouts(con):
    _run_script(con, SQL_FILE)
    rows = con.execute(
        "SELECT layout FROM dwt.v_tuning_summary ORDER BY layout"
    ).fetchall()
    layouts = {r[0] for r in rows}
    expected = {
        "orders_unsorted",
        "orders_by_date",
        "orders_by_user",
        "orders_compound",
        "orders_skewed",
        "events_by_ts",
    }
    missing = expected - layouts
    assert not missing, f"summary view missing layouts: {missing}"
    assert layouts == expected, f"unexpected extra layouts: {layouts - expected}"