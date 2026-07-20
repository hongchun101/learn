"""SQL contract tests — the invariants every module must satisfy.

These run against the DuckDB reference implementation. Each module's
test file ports these assertions to its engine (Hive / Spark / Trino
/ Flink). The DuckDB file is the spec; if the reference fails, the
spec is wrong; if the reference passes and a module fails, the
module's port is wrong.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from shared.sql_runner import SqlRunner

DATA_DIR = Path("data") / "small"
CONTRACT_SQL = (Path("sql-contract") / "reference_duckdb.sql").read_text(
    encoding="utf-8"
)


@pytest.fixture(scope="module")
def runner() -> SqlRunner:
    r = SqlRunner(":memory:", DATA_DIR)
    r.run_script(CONTRACT_SQL)
    return r


# ---------- I.1 source-to-ODS ---------------------------------------

def test_i1_ods_row_counts(runner: SqlRunner) -> None:
    runner.assert_eq(
        "SELECT COUNT(*) FROM ods.users", 1000, "ods.users"
    )
    runner.assert_eq(
        "SELECT COUNT(*) FROM ods.orders", 10_000, "ods.orders"
    )
    runner.assert_eq(
        "SELECT COUNT(*) FROM ods.user_events", 50_000, "ods.user_events"
    )


# ---------- I.2 ODS -> DWD cleaning ---------------------------------

def test_i2a_dwd_orders_le_ods_orders(runner: SqlRunner) -> None:
    raw = runner.fetchone("SELECT COUNT(*) FROM ods.orders")[0]
    dwd = runner.fetchone("SELECT COUNT(*) FROM dwd.orders")[0]
    assert dwd <= raw, f"dwd={dwd} > raw={raw}"


def test_i2b_dwd_orders_no_null_keys(runner: SqlRunner) -> None:
    runner.assert_eq(
        "SELECT COUNT(*) FROM dwd.orders WHERE order_id IS NULL "
        "OR user_id IS NULL OR total IS NULL",
        0, "dwd.orders key nulls"
    )


def test_i2c_dwd_orders_status_conformed(runner: SqlRunner) -> None:
    runner.assert_eq(
        "SELECT COUNT(*) FROM dwd.orders WHERE status NOT IN "
        "('created','paid','shipped','completed','cancelled','refunded','unknown')",
        0, "dwd.orders status set"
    )


# ---------- I.3 DWD -> DWS aggregate --------------------------------

def test_i3a_dws_sum_matches_dwd_sum(runner: SqlRunner) -> None:
    dwd_sum = runner.fetchone("SELECT ROUND(SUM(total),2) FROM dwd.orders")[0]
    dws_sum = runner.fetchone(
        "SELECT ROUND(SUM(order_amount),2) FROM dws.user_order_1d"
    )[0]
    assert dwd_sum == dws_sum, f"dwd={dwd_sum} dws={dws_sum}"


def test_i3b_dws_user_count_matches(runner: SqlRunner) -> None:
    n_dwd = runner.fetchone(
        "SELECT COUNT(DISTINCT user_id) FROM dwd.orders"
    )[0]
    n_dws = runner.fetchone(
        "SELECT COUNT(DISTINCT user_id) FROM dws.user_order_1d"
    )[0]
    assert n_dwd == n_dws, f"dwd users={n_dwd} dws users={n_dws}"


# ---------- I.4 SCD-2 integrity -------------------------------------

def test_i4_one_current_per_user(runner: SqlRunner) -> None:
    runner.assert_eq(
        "SELECT COUNT(*) FROM (SELECT user_id, COUNT(*) c "
        "FROM dim.user_scd2 WHERE is_current "
        "GROUP BY user_id HAVING c > 1)",
        0, "scd2 multiple current rows"
    )


# ---------- I.5 referential integrity -------------------------------

def test_i5_dwd_user_in_dim(runner: SqlRunner) -> None:
    runner.assert_eq(
        "SELECT COUNT(*) FROM dwd.orders o "
        "LEFT JOIN dim.user_scd2 d ON o.user_id = d.user_id "
        "WHERE d.user_id IS NULL",
        0, "orphan user_id in dwd.orders"
    )


# ---------- I.6 idempotency -----------------------------------------

def test_i6_rerun_yields_same_count(runner: SqlRunner) -> None:
    n1 = runner.fetchone("SELECT COUNT(*) FROM dwd.orders")[0]
    runner.run_script(CONTRACT_SQL)
    n2 = runner.fetchone("SELECT COUNT(*) FROM dwd.orders")[0]
    assert n1 == n2, f"first={n1} rerun={n2}"


# ---------- I.7 late-arriving data ----------------------------------

def test_i7_dt_uses_order_date_not_load_date(runner: SqlRunner) -> None:
    max_ods_ts = runner.fetchone("SELECT MAX(order_ts) FROM ods.orders")[0]
    max_dwd_dt = runner.fetchone("SELECT MAX(dt) FROM dwd.orders")[0]
    assert max_ods_ts.date() >= max_dwd_dt, (
        f"max(order_ts)={max_ods_ts} max(dt)={max_dwd_dt}"
    )


# ---------- I.8 end-to-end reconciliation ---------------------------

def test_i8_dwd_dws_ads_reconcile(runner: SqlRunner) -> None:
    dwd = runner.fetchone("SELECT ROUND(SUM(total),2) FROM dwd.orders")[0]
    dws = runner.fetchone(
        "SELECT ROUND(SUM(order_amount),2) FROM dws.user_order_1d"
    )[0]
    ads = runner.fetchone("SELECT ROUND(SUM(gmv),2) FROM ads.gmv_daily")[0]
    assert dwd == dws == ads, f"dwd={dwd} dws={dws} ads={ads}"


# ---------- I.9 real-time append-only stream ------------------------

def test_i9_user_events_dedup(runner: SqlRunner) -> None:
    runner.assert_eq(
        "SELECT COUNT(*) - COUNT(DISTINCT event_id) FROM dwd.user_events",
        0, "dwd.user_events has duplicate event_id"
    )


# ---------- ADS-specific spot checks --------------------------------

def test_ads_user_rfm_row_count(runner: SqlRunner) -> None:
    n = runner.fetchone("SELECT COUNT(*) FROM ads.user_rfm")[0]
    # Should at least cover the user base; allow <= n_users
    assert n <= 1_000, f"too many RFM rows: {n}"


def test_ads_daily_kpi_non_negative(runner: SqlRunner) -> None:
    bad = runner.fetchone(
        "SELECT COUNT(*) FROM ads.daily_kpi WHERE gmv < 0 OR order_count < 0"
    )[0]
    assert bad == 0, f"daily_kpi has negative rows: {bad}"


# ---------- DWT topic table -----------------------------------------

def test_dwt_user_topic_lifetime_amount(runner: SqlRunner) -> None:
    dwt = runner.fetchone("SELECT ROUND(SUM(lifetime_amount),2) FROM dwt.user_topic")[0]
    dws = runner.fetchone("SELECT ROUND(SUM(order_amount),2) FROM dws.user_order_1d")[0]
    assert dwt == dws, f"dwt={dwt} dws={dws}"
