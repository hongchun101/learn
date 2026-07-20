"""Module 13 / Data Lake — verify Iceberg-like features in DuckDB.

We exercise the four headline lake-table capabilities that the demo SQL
script materialises:

    (1) snapshot manifest is consistent with the row counts we observe
    (2) time travel across v1/v2/v3 shows monotonically growing totals
        and the synthetic row only appears in v3
    (3) schema evolution (ADD / RENAME / DROP COLUMN) leaves the column
        list equal to the original after the round-trip
    (4) hidden partitioning + partition pruning: the hive-partitioned
        parquet layout is what the COPY statement produces, and a
        date-predicate query yields the right filtered count

The runner below mirrors the project-wide test harness: each test starts
from a fresh in-memory DuckDB, loads the demo parquet set into ods.*,
then runs the demo SQL script statement-by-statement.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from shared.sql_runner import _split_statements  # noqa: E402

DATA = ROOT / "data" / "small"
LAKE_OUT = ROOT / "data" / "_lake_out"
SQL_FILE = ROOT / "modules" / "13-data-lake" / "src" / "lake_demo.sql"


# ---------- shared fixtures ---------------------------------------------------

@pytest.fixture()
def con():
    """Fresh in-memory DuckDB with ods.* loaded from data/small/*.parquet."""
    # DuckDB's COPY won't auto-create nested parents; pre-create the lake
    # output root so the COPY statement in the demo SQL can succeed.
    os.makedirs(LAKE_OUT, exist_ok=True)
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} "
            f"AS SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    return c


def _run_script(con, sql_path: Path) -> None:
    """Execute the demo SQL file, skipping pure comments and EXPLAINs."""
    text = sql_path.read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        if s.upper().startswith("EXPLAIN"):
            continue
        con.execute(s)


# ---------- tests -------------------------------------------------------------

def test_snapshot_manifest_row_counts(con) -> None:
    """The snapshot manifest's row_count column must match each snapshot view."""
    _run_script(con, SQL_FILE)
    rows = con.execute("""
        SELECT snapshot_id, row_count
        FROM ods.orders_snapshots
        ORDER BY snapshot_id
    """).fetchall()
    assert rows == [
        (1, con.execute("SELECT COUNT(*) FROM ods.orders_v1").fetchone()[0]),
        (2, con.execute("SELECT COUNT(*) FROM ods.orders_v2").fetchone()[0]),
        (3, con.execute("SELECT COUNT(*) FROM ods.orders_v3").fetchone()[0]),
    ]
    # the third snapshot must be strictly larger than the first
    assert rows[2][1] > rows[0][1]


def test_time_travel_v1_v2_v3(con) -> None:
    """v1, v2, v3 are distinct points in time with strictly increasing totals
    and the synthetic row is visible only from v3 onward."""
    _run_script(con, SQL_FILE)

    sum_v1 = con.execute("SELECT SUM(total) FROM ods.orders_v1").fetchone()[0]
    sum_v2 = con.execute("SELECT SUM(total) FROM ods.orders_v2").fetchone()[0]
    sum_v3 = con.execute("SELECT SUM(total) FROM ods.orders_v3").fetchone()[0]

    # v2 = v1 + 5.00 (we bumped 5 rows by +1.00 each); v3 inherits v2.
    assert sum_v2 == pytest.approx(sum_v1 + 5.00, rel=1e-9)
    assert sum_v3 == pytest.approx(sum_v2, rel=1e-9)
    assert sum_v2 > sum_v1
    assert sum_v3 > sum_v1

    # the synthetic 9999999 row is in v3, not in v1/v2
    assert con.execute(
        "SELECT COUNT(*) FROM ods.orders_v3 WHERE order_id = 9999999"
    ).fetchone()[0] == 1
    assert con.execute(
        "SELECT COUNT(*) FROM ods.orders_v2 WHERE order_id = 9999999"
    ).fetchone()[0] == 0
    assert con.execute(
        "SELECT COUNT(*) FROM ods.orders_v1 WHERE order_id = 9999999"
    ).fetchone()[0] == 0


def test_schema_evolution_round_trip(con) -> None:
    """After ADD + RENAME + DROP + reverse RENAME, the column list of
    ods.orders_v3 must equal the original orders schema."""
    _run_script(con, SQL_FILE)

    cols_v3 = {
        row[0]
        for row in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'ods' AND table_name = 'orders_v3'"
        ).fetchall()
    }
    cols_orig = {
        row[0]
        for row in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'ods' AND table_name = 'orders'"
        ).fetchall()
    }
    assert cols_v3 == cols_orig
    # sanity: the status column survived the round trip
    assert "status" in cols_v3


def test_partition_pruning(con) -> None:
    """The hive-partitioned parquet layout must exist and the
    date-filtered query must return a deterministic, non-negative count
    that matches a direct COUNT against ods.orders."""
    _run_script(con, SQL_FILE)

    base = LAKE_OUT / "orders_by_date"
    assert base.exists(), f"expected hive-partitioned output at {base}"
    # 365 daily partitions for the 2024 calendar year
    date_dirs = [p for p in base.iterdir() if p.name.startswith("order_date=")]
    assert len(date_dirs) >= 300, f"too few date partitions: {len(date_dirs)}"

    # same predicate in two ways — must agree
    pruned = con.execute(f"""
        SELECT COUNT(*)
        FROM read_parquet('{base.as_posix()}/*/*.parquet',
                          hive_partitioning = true)
        WHERE order_date = DATE '2024-01-15'
    """).fetchone()[0]
    direct = con.execute("""
        SELECT COUNT(*) FROM ods.orders WHERE order_date = DATE '2024-01-15'
    """).fetchone()[0]
    assert pruned == direct
    assert pruned >= 0  # never negative even on an empty date