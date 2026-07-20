"""Data quality framework tests — engine-agnostic SQL rules.

These verify the shared DQ helpers produce violation rows when rules
are broken, and produce no rows when the data is clean. The
`shared/data_quality.py` helpers are used by modules 15 and 18.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from shared.data_quality import (
    Rule,
    RuleSet,
    evaluate,
    evaluate_sql,
    orders_rules,
    user_events_rules,
)
from shared.sql_runner import SqlRunner

DATA_DIR = Path("data") / "small"


@pytest.fixture(scope="module")
def runner() -> SqlRunner:
    return SqlRunner(":memory:", DATA_DIR)


# ---------- DQ: positive case --------------------------------------

def test_clean_orders_have_no_violations(runner: SqlRunner) -> None:
    """The seeded dataset is clean. orders_rules() must find 0 issues."""
    rs = orders_rules()
    bad = evaluate_sql(rs, runner, "ods.orders")
    assert bad.empty, f"unexpected violations:\n{bad}"


def test_clean_user_events_have_no_violations(runner: SqlRunner) -> None:
    rs = user_events_rules()
    bad = evaluate_sql(rs, runner, "ods.user_events")
    assert bad.empty, f"unexpected violations:\n{bad}"


# ---------- DQ: negative case --------------------------------------

def test_injected_nulls_are_caught(runner: SqlRunner) -> None:
    runner.execute("CREATE TABLE ods.orders_bad AS SELECT * FROM ods.orders")
    runner.execute(
        "UPDATE ods.orders_bad SET user_id = NULL WHERE order_id = 1"
    )
    rs = RuleSet().not_null("user_id")
    bad = evaluate_sql(rs, runner, "ods.orders_bad")
    assert len(bad) == 1
    assert bad.iloc[0]["rule"] == "user_id_not_null"
    assert bad.iloc[0]["count"] == 1


def test_injected_bad_status_is_caught(runner: SqlRunner) -> None:
    runner.execute("CREATE TABLE ods.orders_bad2 AS SELECT * FROM ods.orders")
    runner.execute(
        "UPDATE ods.orders_bad2 SET status = 'bogus' WHERE order_id = 2"
    )
    rs = RuleSet().in_set("status", ["created", "paid", "completed"])
    bad = evaluate_sql(rs, runner, "ods.orders_bad2")
    assert len(bad) == 1
    assert bad.iloc[0]["rule"] == "status_in_set"


def test_range_check_negative_total(runner: SqlRunner) -> None:
    runner.execute("CREATE TABLE ods.orders_bad3 AS SELECT * FROM ods.orders")
    runner.execute(
        "UPDATE ods.orders_bad3 SET total = -100 WHERE order_id = 3"
    )
    rs = RuleSet().range_check("total", 0, 1_000_000)
    bad = evaluate_sql(rs, runner, "ods.orders_bad3")
    assert len(bad) == 1
    assert bad.iloc[0]["rule"] == "total_range"


# ---------- Python evaluate() smoke test ----------------------------

def test_pandas_evaluate() -> None:
    df = pd.DataFrame(dict(
        a=[1, 2, None, 4],
        b=["x", "y", "z", "w"],
    ))
    rs = RuleSet().not_null("a").in_set("b", ["x", "y"])
    out = evaluate(rs, df)
    # a_not_null and b_in_set both trigger
    rules = set(out["rule"].tolist())
    assert "a_not_null" in rules
    assert "b_in_set" in rules
