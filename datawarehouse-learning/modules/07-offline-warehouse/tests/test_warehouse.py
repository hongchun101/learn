"""Tests for Module 07 — Offline Data Warehouse pipeline.

Every test runs the full ODS -> DWD -> DWS -> DWT -> ADS pipeline on the
e-commerce dataset (loaded from ``data/small/*.parquet`` into ``ods.*``)
and asserts that the resulting tables reconcile to a single, agreed
definition of GMV.

GMV contract (used by every layer that reports it):
    GMV = SUM(order_amount) WHERE order_status <> 'cancelled'
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
SQL_FILE = (
    ROOT
    / "modules"
    / "07-offline-warehouse"
    / "src"
    / "warehouse_demo.sql"
)


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    """Fresh in-memory DuckDB with the demo parquet loaded as ``ods.*``."""
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    return c


def _run_script(con: duckdb.DuckDBPyConnection, sql_path: Path) -> None:
    """Execute a .sql file using the same splitter the rest of the curriculum uses."""
    text = sql_path.read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        if s.upper().startswith("EXPLAIN"):
            continue
        con.execute(s)


@pytest.fixture()
def warehouse(con: duckdb.DuckDBPyConnection) -> duckdb.DuckDBPyConnection:
    """Run the full warehouse pipeline once, return the connection."""
    _run_script(con, SQL_FILE)
    return con


# -- the headline reconciliation: every layer must agree on GMV ---------------

def test_gmv_reconciles_across_layers(warehouse: duckdb.DuckDBPyConnection) -> None:
    """DWD, DWS, DWT, ADS must all sum to the same GMV."""
    dwd_gmv = warehouse.execute(
        "SELECT ROUND(SUM(order_amount), 2) FROM dwd.dwd_orders "
        "WHERE order_status <> 'cancelled'"
    ).fetchone()[0]
    dws_gmv = warehouse.execute(
        "SELECT ROUND(SUM(gmv_net), 2) FROM dws.dws_user_order_day"
    ).fetchone()[0]
    dwt_gmv = warehouse.execute(
        "SELECT ROUND(SUM(lifetime_gmv_net), 2) FROM dwt.dwt_user_lifecycle"
    ).fetchone()[0]
    ads_daily_gmv = warehouse.execute(
        "SELECT ROUND(SUM(gmv), 2) FROM ads.ads_gmv_daily"
    ).fetchone()[0]
    ads_lifetime_gmv = warehouse.execute(
        "SELECT ROUND(SUM(gmv), 2) FROM ads.ads_user_lifetime"
    ).fetchone()[0]
    ads_overall = warehouse.execute(
        "SELECT total_gmv FROM ads.ads_overall_kpi"
    ).fetchone()[0]

    assert dwd_gmv is not None and dwd_gmv > 0, "dwd GMV should be positive"
    assert dws_gmv == dwd_gmv, f"DWS GMV ({dws_gmv}) != DWD GMV ({dwd_gmv})"
    assert dwt_gmv == dwd_gmv, f"DWT GMV ({dwt_gmv}) != DWD GMV ({dwd_gmv})"
    assert ads_daily_gmv == dwd_gmv, (
        f"ADS daily GMV ({ads_daily_gmv}) != DWD GMV ({dwd_gmv})"
    )
    assert ads_lifetime_gmv == dwd_gmv, (
        f"ADS lifetime GMV ({ads_lifetime_gmv}) != DWD GMV ({dwd_gmv})"
    )
    assert round(float(ads_overall), 2) == dwd_gmv, (
        f"ads_overall_kpi.total_gmv ({ads_overall}) != DWD GMV ({dwd_gmv})"
    )


def test_dwd_cleans_bad_rows(warehouse: duckdb.DuckDBPyConnection) -> None:
    """DWD must drop orders with NULL PK / negative total."""
    raw = warehouse.execute(
        "SELECT COUNT(*) FROM ods.orders"
    ).fetchone()[0]
    cleaned = warehouse.execute(
        "SELECT COUNT(*) FROM dwd.dwd_orders"
    ).fetchone()[0]
    # Every raw order in the demo dataset is well-formed, so DWD must keep
    # 100% of rows. This guards against accidental WHERE-clause over-filtering.
    assert raw > 0
    assert cleaned == raw, (
        f"DWD dropped {raw - cleaned} well-formed rows — over-filtering"
    )

    # status must be lower-cased by the cleaning rule.
    statuses = warehouse.execute(
        "SELECT DISTINCT order_status FROM dwd.dwd_orders"
    ).fetchall()
    for (s,) in statuses:
        assert s == s.lower(), f"status not normalised: {s!r}"
        assert s == s.strip(), f"status not trimmed: {s!r}"


def test_scd2_dimension_has_two_versions(warehouse: duckdb.DuckDBPyConnection) -> None:
    """SCD-2 dim_user_scd2: even user_ids must have exactly 2 versions;
    odd user_ids must have exactly 1 version."""
    even_two = warehouse.execute(
        "SELECT COUNT(*) FROM dwd.dim_user_scd2 "
        "WHERE user_id % 2 = 0"
    ).fetchone()[0]
    even_users = warehouse.execute(
        "SELECT COUNT(DISTINCT user_id) FROM dwd.dim_user_scd2 "
        "WHERE user_id % 2 = 0"
    ).fetchone()[0]
    odd_one = warehouse.execute(
        "SELECT COUNT(*) FROM dwd.dim_user_scd2 "
        "WHERE user_id % 2 = 1"
    ).fetchone()[0]
    odd_users = warehouse.execute(
        "SELECT COUNT(DISTINCT user_id) FROM dwd.dim_user_scd2 "
        "WHERE user_id % 2 = 1"
    ).fetchone()[0]

    assert even_two == 2 * even_users, (
        f"even user_ids should have 2 SCD-2 rows each, "
        f"got {even_two} rows for {even_users} users"
    )
    assert odd_one == odd_users, (
        f"odd user_ids should have 1 SCD-2 row each, "
        f"got {odd_one} rows for {odd_users} users"
    )

    # exactly one current version per user
    currents = warehouse.execute(
        "SELECT COUNT(*) FROM dwd.dim_user_scd2 WHERE is_current"
    ).fetchone()[0]
    total_users = warehouse.execute(
        "SELECT COUNT(DISTINCT user_id) FROM dwd.dim_user_scd2"
    ).fetchone()[0]
    assert currents == total_users, (
        f"expected exactly one current row per user, "
        f"got {currents} currents vs {total_users} users"
    )


def test_partition_pruning_works_on_dwd(
    warehouse: duckdb.DuckDBPyConnection,
) -> None:
    """DWD must carry a dt partition column that survives a year/month filter."""
    # Sum of GMV over every dt must equal the unfiltered sum.
    full = warehouse.execute(
        "SELECT ROUND(SUM(order_amount), 2) FROM dwd.dwd_orders "
        "WHERE order_status <> 'cancelled'"
    ).fetchone()[0]
    by_partition = warehouse.execute(
        "SELECT ROUND(SUM(order_amount), 2) FROM dwd.dwd_orders "
        "WHERE order_status <> 'cancelled' "
        "  AND dt_year = 2024 AND dt_month BETWEEN 1 AND 12"
    ).fetchone()[0]
    assert full == by_partition, (
        f"dt_year/dt_month partition did not return the full 2024 GMV: "
        f"{by_partition} vs {full}"
    )

    # Every DWD row must have a non-null dt.
    null_dt = warehouse.execute(
        "SELECT COUNT(*) FROM dwd.dwd_orders WHERE dt IS NULL"
    ).fetchone()[0]
    assert null_dt == 0, f"{null_dt} dwd_orders rows have NULL dt"


def test_dws_aggregates_match_dwd_row_count(
    warehouse: duckdb.DuckDBPyConnection,
) -> None:
    """Sum of DWS order_cnt must equal the DWD row count of paying orders."""
    dws_orders = warehouse.execute(
        "SELECT SUM(order_cnt) FROM dws.dws_user_order_day"
    ).fetchone()[0]
    dwd_orders = warehouse.execute(
        "SELECT COUNT(*) FROM dwd.dwd_orders"
    ).fetchone()[0]
    assert dws_orders == dwd_orders, (
        f"DWS order_cnt sum ({dws_orders}) != DWD row count ({dwd_orders})"
    )

    # Sum of DWS gmv_net must equal the DWD gmv_net (already checked in
    # test_gmv_reconciles_across_layers but repeated here as a direct,
    # focused assertion on the DWS layer).
    dws_gmv = warehouse.execute(
        "SELECT ROUND(SUM(gmv_net), 2) FROM dws.dws_user_order_day"
    ).fetchone()[0]
    dwd_gmv = warehouse.execute(
        "SELECT ROUND(SUM(order_amount), 2) FROM dwd.dwd_orders "
        "WHERE order_status <> 'cancelled'"
    ).fetchone()[0]
    assert dws_gmv == dwd_gmv


def test_dwt_user_count_matches_buyers(
    warehouse: duckdb.DuckDBPyConnection,
) -> None:
    """DWT must contain exactly the buyers that appear in DWD."""
    dwt_users = warehouse.execute(
        "SELECT COUNT(DISTINCT user_id) FROM dwt.dwt_user_lifecycle"
    ).fetchone()[0]
    dwd_buyers = warehouse.execute(
        "SELECT COUNT(DISTINCT user_id) FROM dwd.dwd_orders "
        "WHERE order_status <> 'cancelled'"
    ).fetchone()[0]
    assert dwt_users == dwd_buyers, (
        f"DWT user count ({dwt_users}) != number of paying DWD users "
        f"({dwd_buyers})"
    )

    # The ADS user-lifetime row count must equal the DWT user count.
    ads_users = warehouse.execute(
        "SELECT COUNT(*) FROM ads.ads_user_lifetime"
    ).fetchone()[0]
    assert ads_users == dwt_users, (
        f"ADS user_lifetime ({ads_users}) != DWT users ({dwt_users})"
    )