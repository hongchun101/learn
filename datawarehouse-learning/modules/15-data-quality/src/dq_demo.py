"""Data quality demo — extend shared/data_quality.py with realistic checks.

This module shows the six core DQ checks end-to-end against the
parquet demo data:

  1. Freshness        : how old is the most recent record?
  2. Row count        : did today's batch land at all?
  3. Schema           : are expected columns present with right types?
  4. Nulls            : which columns have unexpected nulls?
  5. Ranges           : are numeric values in plausible ranges?
  6. Business rules   : do in-set / cross-column rules hold?

It can run as a script:

    python dq_demo.py           # healthy tables, expect empty violations
    python dq_demo.py --broken  # inject issues, expect violations

Or be imported from tests for assertion-based testing.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable

import duckdb
import pandas as pd

# Make the project root importable regardless of CWD.
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from shared.data_quality import (  # noqa: E402
    Rule, RuleSet, evaluate, evaluate_sql,
    orders_rules, user_events_rules,
)
from shared.sql_runner import SqlRunner  # noqa: E402

DATA_DIR = ROOT / "data" / "small"


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

def freshness_check(table: str, ts_col: str, max_age_hours: int) -> Rule:
    """A row is a violation if the timestamp is older than the threshold."""
    return Rule(
        name=f"{table}.{ts_col}_freshness",
        sql=(
            f"{ts_col} IS NULL OR "
            f"CAST({ts_col} AS TIMESTAMP) < "
            f"(now() - INTERVAL {max_age_hours} HOUR)"
        ),
        severity="error",
        description=(
            f"{table}.{ts_col} must be within last {max_age_hours}h"
        ),
    )


def row_count_min(n: int) -> Rule:
    """Hard floor on row count — 0 violations == table is non-empty."""
    return Rule(
        name=f"row_count_min_{n}",
        sql="1=0",  # evaluated dynamically by evaluate()
        severity="error",
        description=f"row count >= {n}",
    )


def not_null_count(table: str, col: str, max_null: int = 0) -> Rule:
    """A row is a violation when there are more than max_null nulls."""
    return Rule(
        name=f"{table}.{col}_null_count",
        sql=f"{col} IS NULL",
        severity="error",
        description=f"{table}.{col} null count must be <= {max_null}",
    )


def range_check(table: str, col: str, lo: float, hi: float) -> Rule:
    return Rule(
        name=f"{table}.{col}_range",
        sql=f"{col} < {lo} OR {col} > {hi}",
        severity="error",
        description=f"{table}.{col} must be in [{lo}, {hi}]",
    )


def in_set_check(table: str, col: str, allowed: Iterable[str]) -> Rule:
    quoted = ", ".join(f"'{v}'" for v in allowed)
    return Rule(
        name=f"{table}.{col}_in_set",
        sql=f"{col} IS NOT NULL AND {col} NOT IN ({quoted})",
        severity="error",
        description=f"{table}.{col} must be in {sorted(allowed)}",
    )


def cross_column_rule(table: str, name: str, sql: str,
                      severity: str = "error",
                      description: str = "") -> Rule:
    return Rule(
        name=f"{table}.{name}",
        sql=sql,
        severity=severity,
        description=description or sql,
    )


# ---------------------------------------------------------------------------
# Bundle: orders bundle (the canonical demo table)
# ---------------------------------------------------------------------------

def orders_bundle() -> RuleSet:
    """All DQ checks for ods.orders in one RuleSet."""
    rs = RuleSet()
    # 1. Freshness: order_ts within 365 * 24 = 8760h of now (demo data is 2024)
    rs.add(freshness_check("orders", "order_ts", 365 * 24 * 5))
    # 2. Row count: at least 1 row
    rs.add(row_count_min(1))
    # 3. Nulls on the four required columns
    for c in ("order_id", "user_id", "total", "status"):
        rs.add(not_null_count("orders", c))
    # 4. Ranges: total between 0 and 1_000_000, order_id > 0
    rs.add(range_check("orders", "total", 0, 1_000_000))
    rs.add(range_check("orders", "order_id", 1, 10_000_000))
    rs.add(range_check("orders", "user_id", 1, 10_000_000))
    # 5. In-set: status must be one of the lifecycle states
    rs.add(in_set_check(
        "orders", "status",
        ["created", "paid", "shipped", "completed", "cancelled", "refunded"],
    ))
    # 6. Business rules: cancelled orders should never have total > 100_000
    rs.add(cross_column_rule(
        "orders", "cancelled_total_cap",
        "status = 'cancelled' AND total > 100000",
        severity="warn",
        description="cancelled orders rarely exceed 100k",
    ))
    return rs


def user_events_bundle() -> RuleSet:
    rs = RuleSet()
    rs.add(freshness_check("user_events", "event_ts", 365 * 24 * 5))
    rs.add(row_count_min(1))
    for c in ("event_id", "user_id", "event_type", "event_ts"):
        rs.add(not_null_count("user_events", c))
    rs.add(range_check("user_events", "event_id", 1, 1_000_000_000))
    rs.add(in_set_check("user_events", "event_type",
                        ["pv", "cart", "fav", "pay"]))
    return rs


# ---------------------------------------------------------------------------
# Schema check (separate from rule-based)
# ---------------------------------------------------------------------------

EXPECTED_SCHEMA: dict[str, dict[str, str]] = {
    "orders": {
        "order_id": "BIGINT",
        "user_id": "BIGINT",
        "total": "DOUBLE",
        "status": "VARCHAR",
        "order_date": "DATE",
        "order_ts": "TIMESTAMP_NS",
    },
    "user_events": {
        "event_id": "BIGINT",
        "user_id": "BIGINT",
        "event_type": "VARCHAR",
        "page": "VARCHAR",
        "event_ts": "TIMESTAMP_NS",
    },
}


def schema_check(con: duckdb.DuckDBPyConnection,
                 table: str,
                 expected: dict[str, str]) -> list[str]:
    """Return a list of schema mismatch messages (empty = healthy)."""
    rows = con.execute(f"DESCRIBE ods.{table}").fetchall()
    actual = {r[0]: r[1].upper() for r in rows}
    issues = []
    for col, dtype in expected.items():
        if col not in actual:
            issues.append(f"{table}.{col}: missing column")
        elif actual[col] != dtype.upper():
            issues.append(
                f"{table}.{col}: expected {dtype}, got {actual[col]}"
            )
    return issues


# ---------------------------------------------------------------------------
# Runner helpers
# ---------------------------------------------------------------------------

def build_runner(db_path: str = ":memory:") -> SqlRunner:
    return SqlRunner(db_path=db_path, data_dir=DATA_DIR)


def inject_issues(con: duckdb.DuckDBPyConnection) -> None:
    """Mutate ods.orders and ods.user_events to demonstrate violations.

    The mutations are deliberately small so the test can pinpoint them.
    """
    # Nullify 3 order_id values (not_null violation).
    con.execute(
        "UPDATE ods.orders SET order_id = NULL "
        "WHERE order_id IN (1, 2, 3)"
    )
    # Insert one row with a negative total (range violation).
    con.execute(
        "INSERT INTO ods.orders VALUES "
        "(999999, 1, -50.0, 'unknown', CURRENT_DATE, CURRENT_TIMESTAMP)"
    )
    # Push one order_ts far into the past (freshness violation).
    con.execute(
        "INSERT INTO ods.orders VALUES "
        "(999998, 2, 100.0, 'paid', "
        "DATE '2000-01-01', TIMESTAMP '2000-01-01 00:00:00')"
    )
    # Inject an invalid event_type (in_set violation).
    con.execute(
        "UPDATE ods.user_events SET event_type = 'unknown' "
        "WHERE event_id = 1"
    )


def run_healthy() -> dict:
    """Run the full DQ suite against pristine demo data."""
    runner = build_runner()
    issues: dict[str, object] = {}
    issues["schema"] = {
        t: schema_check(runner.con, t, EXPECTED_SCHEMA[t])
        for t in EXPECTED_SCHEMA
    }
    issues["orders_rules"] = evaluate_sql(
        orders_bundle(), runner, "ods.orders",
    )
    issues["events_rules"] = evaluate_sql(
        user_events_bundle(), runner, "ods.user_events",
    )
    return issues


def run_broken() -> dict:
    """Run the DQ suite against injected-issue data."""
    runner = build_runner()
    inject_issues(runner.con)
    issues: dict[str, object] = {}
    issues["schema"] = {
        t: schema_check(runner.con, t, EXPECTED_SCHEMA[t])
        for t in EXPECTED_SCHEMA
    }
    issues["orders_rules"] = evaluate_sql(
        orders_bundle(), runner, "ods.orders",
    )
    issues["events_rules"] = evaluate_sql(
        user_events_bundle(), runner, "ods.user_events",
    )
    return issues


def summarize(issues: dict) -> str:
    lines = ["=" * 60]
    lines.append("DATA QUALITY REPORT")
    lines.append("=" * 60)
    for table, schema_issues in issues["schema"].items():
        if schema_issues:
            lines.append(f"[SCHEMA FAIL] {table}")
            for s in schema_issues:
                lines.append(f"  - {s}")
        else:
            lines.append(f"[SCHEMA OK ] {table}")
    for section in ("orders_rules", "events_rules"):
        df = issues[section]
        if df.empty:
            lines.append(f"[{section.upper():14s}] clean")
        else:
            lines.append(f"[{section.upper():14s}] {len(df)} violation(s):")
            for _, row in df.iterrows():
                lines.append(
                    f"  - {row['rule']} ({row['severity']}): "
                    f"count={row['count']}"
                )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="DQ demo")
    parser.add_argument("--broken", action="store_true",
                        help="inject issues before running checks")
    args = parser.parse_args(argv)
    issues = run_broken() if args.broken else run_healthy()
    print(summarize(issues))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
