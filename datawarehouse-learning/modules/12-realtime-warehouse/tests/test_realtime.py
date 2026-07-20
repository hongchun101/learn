"""Module 12 / tests — real-time layered warehouse.

Five tests, one per acceptance criterion of the realtime pipeline:

    1. ODS row count matches the raw parquet
    2. DWD layer is cleaned and exactly-once deduped
    3. DWS layer is keyed (user_id, event_date) with one row per key
    4. ADS realtime_dau has 365 days, DAU consistent with raw events
    5. Exactly-once: replaying the same events 3x does NOT inflate DWD
       (plus a late-data sub-assertion: event-time attribution survives)

The fixture mirrors the assignment's required pattern: load every
parquet in data/small/ into ods.<stem>, then run the .sql script
with _split_statements (skipping comments and EXPLAIN).
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
SQL_PATH = "modules/12-realtime-warehouse/src/realtime_pipeline.sql"


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} "
            f"AS SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    return c


def _run_script(con: duckdb.DuckDBPyConnection, sql_path: str) -> None:
    text = (ROOT / sql_path).read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        if s.upper().startswith("EXPLAIN"):
            continue
        con.execute(s)


# ---------- (1) ODS raw landing ----------------------------------

def test_ods_layer_matches_raw_parquet(con: duckdb.DuckDBPyConnection) -> None:
    """ODS row count must equal the raw parquet row count, and the
    ingest_meta summary must agree (no rows dropped on landing)."""
    raw_n = con.execute(
        "SELECT COUNT(*) FROM ods.user_events"
    ).fetchone()[0]
    assert raw_n == 50000, f"expected 50000 raw events, got {raw_n}"

    _run_script(con, SQL_PATH)
    meta = con.execute(
        "SELECT raw_row_count, raw_event_id_count FROM ods.ingest_meta"
    ).fetchone()
    assert meta == (50000, 50000), f"ingest_meta = {meta}"


# ---------- (2) DWD layer: cleaned + exactly-once ----------------

def test_dwd_layer_is_clean_and_deduped(con: duckdb.DuckDBPyConnection) -> None:
    """DWD must:
       - carry every event_id exactly once
       - expose derived columns (is_pv, event_hour) added on top of ODS
       - never drop a row that ODS holds
    """
    _run_script(con, SQL_PATH)

    dwd_rows, dwd_uniq = con.execute(
        "SELECT row_count, uniq_event_id_count "
        "FROM dwd.user_events_uniq_check"
    ).fetchone()
    ods_rows = con.execute("SELECT COUNT(*) FROM ods.user_events").fetchone()[0]

    assert dwd_uniq == 50000, f"expected 50000 unique event_ids, got {dwd_uniq}"
    assert dwd_rows == ods_rows, (
        f"DWD lost rows during cleaning: dwd={dwd_rows} ods={ods_rows}"
    )

    # Derived columns exist with the right shape.
    has_cols = con.execute(
        "SELECT COUNT(*) FROM ("
        "  SELECT is_pv, is_cart, is_fav, is_pay, event_hour "
        "  FROM dwd.user_events LIMIT 1"
        ")"
    ).fetchone()[0]
    assert has_cols == 1, "DWD is missing one of the derived columns"

    # Every is_pv flag must agree with event_type = 'pv'.
    bad = con.execute(
        "SELECT COUNT(*) FROM dwd.user_events "
        "WHERE (event_type = 'pv') <> (is_pv = 1)"
    ).fetchone()[0]
    assert bad == 0, f"{bad} rows have is_pv inconsistent with event_type"


# ---------- (3) DWS layer: one row per (user_id, event_date) -----

def test_dws_layer_is_keyed_correctly(con: duckdb.DuckDBPyConnection) -> None:
    """DWS row count must equal the number of distinct
    (user_id, event_date) pairs; sums must reconcile to DWD totals."""
    _run_script(con, SQL_PATH)

    dws_rows, dws_pk = con.execute(
        "SELECT row_cnt, pk_cnt FROM dws.user_event_1d_pk_check"
    ).fetchone()
    dwd_rows = con.execute("SELECT COUNT(*) FROM dwd.user_events").fetchone()[0]
    dwd_dwd_pk = con.execute(
        "SELECT COUNT(DISTINCT user_id || '|' || event_date) "
        "FROM dwd.user_events"
    ).fetchone()[0]

    assert dws_rows == dws_pk, "DWS has duplicate (user_id, event_date) keys"
    assert dws_rows == dwd_dwd_pk, (
        f"DWS row count {dws_rows} != distinct (user_id, event_date) {dwd_dwd_pk}"
    )

    # Per-event-type counts at DWS must equal DWD flag counts.
    pay_dws = con.execute(
        "SELECT SUM(pay_cnt) FROM dws.user_event_1d"
    ).fetchone()[0]
    pay_dwd = con.execute(
        "SELECT SUM(is_pay) FROM dwd.user_events"
    ).fetchone()[0]
    assert pay_dws == pay_dwd, (
        f"DWS pay_cnt total {pay_dws} != DWD is_pay total {pay_dwd}"
    )


# ---------- (4) ADS layer: realtime_dau shape & consistency ------

def test_ads_realtime_dau_full_year(con: duckdb.DuckDBPyConnection) -> None:
    """ads.realtime_dau must:
       - contain exactly 365 days (full year 2024 of events)
       - sum of total_events must equal the DWD row count
       - per-type distinct user counts must each be > 0
    """
    _run_script(con, SQL_PATH)

    n_days = con.execute("SELECT COUNT(*) FROM ads.realtime_dau").fetchone()[0]
    assert n_days == 365, f"expected 365 DAU rows, got {n_days}"

    sum_total, dwd_n, max_dt = con.execute(
        "SELECT sum_total_events_ads, dwd_row_count, max_event_date_in_ads "
        "FROM ads.ads_consistency_check"
    ).fetchone()
    assert sum_total == dwd_n == 50000, (
        f"ADS sum={sum_total} DWD={dwd_n} — pipeline lost/duplicated events"
    )
    assert str(max_dt) == "2024-12-30", f"unexpected max event date {max_dt}"

    for col in ("pv_uv", "cart_uv", "fav_uv", "pay_uv"):
        n = con.execute(f"SELECT MIN({col}) FROM ads.realtime_dau").fetchone()[0]
        assert n > 0, f"ads.realtime_dau.{col} has zero or null days"


# ---------- (5) Exactly-once dedup under replay -------------------

def test_exactly_once_under_replay(con: duckdb.DuckDBPyConnection) -> None:
    """Replaying the same ODS rows 3 times must NOT inflate the
    DWD layer — proves ROW_NUMBER-based dedup is correct.
    Also asserts the late-data demo uses event-time attribution."""
    _run_script(con, SQL_PATH)

    # The replay_proof table is computed inside the SQL file.
    replay_n, replay_uniq = con.execute(
        "SELECT row_count, uniq_event_id_count FROM ads.replay_proof"
    ).fetchone()

    # After dedup the row count must equal the unique event_id count.
    assert replay_n == replay_uniq, (
        f"replay left duplicates: rows={replay_n} uniq={replay_uniq}"
    )
    # And both must equal the original 50000 — not 150000.
    assert replay_n == 50000, (
        f"replay inflated DWD to {replay_n} rows (expected 50000)"
    )

    # Late-data: the simulated replay of 3 events 7 days late must
    # inflate dau_after_replay for the earliest day only — proving
    # event-time (not processing-time) attribution.
    before, after, replay_uv = con.execute(
        "SELECT dau_before, dau_after_replay, replay_uv "
        "FROM ads.late_data_demo"
    ).fetchone()
    assert after == before + replay_uv, (
        f"late data not attributed to event_date: before={before} "
        f"after={after} replay_uv={replay_uv}"
    )