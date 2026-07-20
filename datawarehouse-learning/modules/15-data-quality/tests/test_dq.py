"""Data quality framework tests.

Five tests cover the full DQ contract:

  1. Healthy data produces no violations (schema + rules).
  2. Null injection is caught by not_null rules.
  3. Out-of-range numeric value is caught by range_check.
  4. Invalid categorical value is caught by in_set_check.
  5. Stale timestamp is caught by freshness_check.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

# The module directory name "15-data-quality" is not a valid Python
# package identifier, so load the demo module by file path.
_DEMO_PATH = ROOT / "modules" / "15-data-quality" / "src" / "dq_demo.py"
_spec = importlib.util.spec_from_file_location("dq_demo_mod", _DEMO_PATH)
dq_demo = importlib.util.module_from_spec(_spec)
sys.modules["dq_demo_mod"] = dq_demo
_spec.loader.exec_module(dq_demo)

from shared.data_quality import evaluate_sql  # noqa: E402
from shared.sql_runner import SqlRunner  # noqa: E402

DATA_DIR = ROOT / "data" / "small"


@pytest.fixture()
def runner() -> SqlRunner:
    """A pristine SqlRunner loaded with the parquet demo data."""
    r = SqlRunner(db_path=":memory:", data_dir=DATA_DIR)
    yield r
    r.close()


# ---------------------------------------------------------------------------
# 1. Healthy data
# ---------------------------------------------------------------------------

def test_healthy_data_passes_all_checks(runner):
    """Pristine demo data must not trip any rule or schema check."""
    schema_issues = {
        t: dq_demo.schema_check(runner.con, t, dq_demo.EXPECTED_SCHEMA[t])
        for t in dq_demo.EXPECTED_SCHEMA
    }
    assert schema_issues == {t: [] for t in dq_demo.EXPECTED_SCHEMA}, (
        f"schema issues found: {schema_issues}"
    )

    orders_violations = evaluate_sql(
        dq_demo.orders_bundle(), runner, "ods.orders",
    )
    events_violations = evaluate_sql(
        dq_demo.user_events_bundle(), runner, "ods.user_events",
    )
    assert orders_violations.empty, (
        f"unexpected order rule violations: "
        f"{orders_violations.to_dict('records')}"
    )
    assert events_violations.empty, (
        f"unexpected event rule violations: "
        f"{events_violations.to_dict('records')}"
    )


# ---------------------------------------------------------------------------
# 2. Null injection
# ---------------------------------------------------------------------------

def test_null_injection_is_caught(runner):
    """Nullifying 3 order_id values must produce a not_null violation."""
    runner.con.execute(
        "UPDATE ods.orders SET order_id = NULL "
        "WHERE order_id IN (1, 2, 3)"
    )
    violations = evaluate_sql(
        dq_demo.orders_bundle(), runner, "ods.orders",
    )
    assert not violations.empty, "expected at least one violation"
    rules_hit = set(violations["rule"].tolist())
    assert "orders.order_id_null_count" in rules_hit, (
        f"order_id_null_count rule not triggered: {rules_hit}"
    )
    null_row = violations.loc[
        violations["rule"] == "orders.order_id_null_count"
    ].iloc[0]
    assert int(null_row["count"]) == 3, (
        f"expected 3 null order_ids, got {null_row['count']}"
    )


# ---------------------------------------------------------------------------
# 3. Range violation
# ---------------------------------------------------------------------------

def test_negative_total_is_caught(runner):
    """A row with total=-50 must trip the range check."""
    runner.con.execute(
        "INSERT INTO ods.orders VALUES "
        "(999999, 1, -50.0, 'paid', CURRENT_DATE, CURRENT_TIMESTAMP)"
    )
    violations = evaluate_sql(
        dq_demo.orders_bundle(), runner, "ods.orders",
    )
    assert not violations.empty
    rules_hit = set(violations["rule"].tolist())
    assert "orders.total_range" in rules_hit, (
        f"total_range rule not triggered: {rules_hit}"
    )


# ---------------------------------------------------------------------------
# 4. In-set violation
# ---------------------------------------------------------------------------

def test_invalid_event_type_is_caught(runner):
    """event_type='unknown' must be flagged by the in_set rule."""
    runner.con.execute(
        "UPDATE ods.user_events SET event_type = 'unknown' "
        "WHERE event_id = 1"
    )
    violations = evaluate_sql(
        dq_demo.user_events_bundle(), runner, "ods.user_events",
    )
    assert not violations.empty
    rules_hit = set(violations["rule"].tolist())
    assert "user_events.event_type_in_set" in rules_hit, (
        f"event_type_in_set rule not triggered: {rules_hit}"
    )


# ---------------------------------------------------------------------------
# 5. Freshness violation
# ---------------------------------------------------------------------------

def test_stale_timestamp_is_caught(runner):
    """An order_ts from year 2000 must be flagged by freshness check."""
    runner.con.execute(
        "INSERT INTO ods.orders VALUES "
        "(999998, 2, 100.0, 'paid', "
        "DATE '2000-01-01', TIMESTAMP '2000-01-01 00:00:00')"
    )
    violations = evaluate_sql(
        dq_demo.orders_bundle(), runner, "ods.orders",
    )
    assert not violations.empty
    rules_hit = set(violations["rule"].tolist())
    assert "orders.order_ts_freshness" in rules_hit, (
        f"order_ts_freshness rule not triggered: {rules_hit}"
    )
    fresh_row = violations.loc[
        violations["rule"] == "orders.order_ts_freshness"
    ].iloc[0]
    assert int(fresh_row["count"]) >= 1
