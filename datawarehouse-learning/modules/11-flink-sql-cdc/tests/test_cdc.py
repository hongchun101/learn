"""Module 11 / tests — CDC semantics.

Asserts that a DuckDB simulation of CDC pipeline:
  - maintains a current snapshot per key,
  - applies late-arriving updates without losing current state,
  - honours DELETE,
  - preserves full audit log.
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
SCRIPT = "modules/11-flink-sql-cdc/src/cdc_demo.sql"


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    text = (ROOT / SCRIPT).read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        c.execute(s)
    return c


# ---------- ch04: initial CDC load ----------

def test_cdc_initial_load_count(con) -> None:
    n = con.execute("SELECT COUNT(*) FROM cdc.user_cdc").fetchone()[0]
    # 6 initial ops + 1 late-arriving update for user 1
    assert n == 7


# ---------- ch05: lookup-style current state ----------

def test_current_snapshot_has_one_per_user(con) -> None:
    """The current snapshot must have exactly one row per user, with
    the latest non-deleted level."""
    rows = con.execute("""
        SELECT user_id, user_name, level FROM cdc_out.user_current
        ORDER BY user_id
    """).fetchall()
    by_user = {r[0]: (r[1], r[2]) for r in rows}
    # user 2 was deleted → must NOT appear
    assert 2 not in by_user
    # user 1's latest non-deleted is platinum
    assert by_user[1] == ('alice', 'platinum')
    # user 3 only has initial insert
    assert by_user[3] == ('carol', 'bronze')


def test_user_2_deleted(con) -> None:
    n = con.execute("""
        SELECT COUNT(*) FROM cdc_out.user_current WHERE user_id = 2
    """).fetchone()[0]
    assert n == 0


# ---------- ch06: state retention in audit log ----------

def test_audit_log_keeps_all_history(con) -> None:
    """The CDC source keeps every event including deletes (for audit)."""
    n = con.execute("""
        SELECT COUNT(*) FROM cdc.user_cdc WHERE user_id = 1
    """).fetchone()[0]
    # user 1: I, U (gold), U (platinum), U (silver-late)
    assert n == 4


# ---------- ch07: late-arriving data ----------

def test_late_data_does_not_disturb_current(con) -> None:
    """The script rebuilds cdc_out.user_current_v2 after inserting a
    late update for user 1 (silver at 2024-02-01, but platinum at
    2024-06-01 is the latest). Current must remain platinum.
    """
    row = con.execute("""
        SELECT user_name, level FROM cdc_out.user_current_v2
        WHERE user_id = 1
    """).fetchone()
    assert row == ('alice', 'platinum')
