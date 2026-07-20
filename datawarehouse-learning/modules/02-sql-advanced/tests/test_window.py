"""Module 02 / tests — window functions, recursive CTE, PIVOT, LATERAL."""
from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from shared.sql_runner import _split_statements  # noqa: E402

DATA = ROOT / "data" / "small"


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    return c


def _run_script(con, sql_path: str) -> None:
    text = (ROOT / sql_path).read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        if s.upper().startswith("EXPLAIN"):  # skip plan queries
            continue
        con.execute(s)


# ---------- ch01: grouping ----------------------------------------

def test_ch01_grouping_sets_runs(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch01_advanced_grouping.sql")
    n = con.execute("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'ods' AND table_name = 'orders'
    """).fetchone()[0]
    assert n == 1


def test_ch01_approx_distinct_runs(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch01_advanced_grouping.sql")
    approx, exact = con.execute("""
        SELECT approx_count_distinct(user_id), COUNT(DISTINCT user_id)
        FROM ods.orders
    """).fetchone()
    # small dataset: HLL error is large; just assert both are > 0
    # and within an order of magnitude
    assert approx > 0
    assert exact > 0
    assert 0.5 < approx / exact < 2.0


def test_ch01_having_filter_works(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch01_advanced_grouping.sql")
    rows = con.execute("""
        SELECT user_id, COUNT(*) n, SUM(total) gmv
        FROM ods.orders WHERE total > 0
        GROUP BY user_id HAVING COUNT(*) >= 3 AND SUM(total) > 500
        ORDER BY gmv DESC LIMIT 1
    """).fetchone()
    assert rows is not None
    user_id, n, gmv = rows
    assert n >= 3
    assert gmv > 500


# ---------- ch02: window functions --------------------------------

def test_ch02_row_number_one_per_user(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch02_window_functions.sql")
    n = con.execute("""
        SELECT COUNT(*) FROM (
          SELECT user_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_ts) rn
          FROM ods.orders
        ) WHERE rn = 1
    """).fetchone()[0]
    n_users = con.execute("SELECT COUNT(DISTINCT user_id) FROM ods.orders").fetchone()[0]
    assert n == n_users


def test_ch02_lag_matches_partition_size(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch02_window_functions.sql")
    n = con.execute("SELECT COUNT(*) FROM ods.orders").fetchone()[0]
    n_lagged = con.execute("""
        SELECT COUNT(*) FROM (
          SELECT LAG(total) OVER (PARTITION BY user_id ORDER BY order_ts) AS prev
          FROM ods.orders
        ) WHERE prev IS NOT NULL
    """).fetchone()[0]
    n_users = con.execute("SELECT COUNT(DISTINCT user_id) FROM ods.orders").fetchone()[0]
    assert n_lagged == n - n_users


def test_ch02_moving_average_window(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch02_window_functions.sql")
    n = con.execute("""
        SELECT COUNT(*) FROM (
          SELECT AVG(order_amount) OVER (
            ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
          ) ma7
          FROM (
            SELECT CAST(order_date AS DATE) dt, SUM(total) order_amount
            FROM ods.orders GROUP BY 1
          )
        ) WHERE ma7 IS NOT NULL
    """).fetchone()[0]
    assert n > 0


# ---------- ch03: recursive CTE -----------------------------------

def test_ch03_date_series_fills_gaps(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch03_recursive_cte.sql")
    n_days = con.execute("""
        WITH RECURSIVE dates AS (
          SELECT MIN(dt) dt FROM demo.daily_orders
          UNION ALL
          SELECT dt + INTERVAL 1 DAY FROM dates
          WHERE dt < (SELECT MAX(dt) FROM demo.daily_orders)
        )
        SELECT COUNT(*) FROM dates
    """).fetchone()[0]
    assert n_days >= 365


def test_ch03_fibonacci_stops_at_correct_bound(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch03_recursive_cte.sql")
    fibs = [r[0] for r in con.execute("""
        WITH RECURSIVE fib(a, b) AS (
          SELECT 0, 1
          UNION ALL
          SELECT b, a + b FROM fib WHERE a < 100
        )
        SELECT a FROM fib
    """).fetchall()]
    # Up to a < 100: emits 0..89 then 144 (since 89+55=144);
    # the next recursion's a=144 fails < 100.
    assert fibs == [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]


def test_ch03_org_chart_full_tree(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch03_recursive_cte.sql")
    n = con.execute("""
        WITH RECURSIVE tree AS (
          SELECT id, manager_id, 0 AS depth FROM demo.org WHERE manager_id IS NULL
          UNION ALL
          SELECT e.id, e.manager_id, t.depth + 1
          FROM demo.org e JOIN tree t ON e.manager_id = t.id
        )
        SELECT COUNT(*) FROM tree
    """).fetchone()[0]
    assert n == 9


def test_ch03_bom_explosion(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch03_recursive_cte.sql")
    parts = con.execute("""
        WITH RECURSIVE e AS (
          SELECT part, parent_part, qty, 1 AS level
          FROM demo.bom WHERE parent_part = 'X'
          UNION ALL
          SELECT b.part, b.parent_part, b.qty * e.qty, e.level + 1
          FROM demo.bom b JOIN e ON b.parent_part = e.part
        )
        SELECT DISTINCT part FROM e
    """).fetchall()
    parts = {p[0] for p in parts}
    assert {'A', 'B', 'A1', 'A2', 'B1', 'A1a', 'A1b'} <= parts


# ---------- ch04: PIVOT / UNPIVOT ---------------------------------

def test_ch04_pivot_wider_rows_than_long(con) -> None:
    """PIVOT/UNPIVOT on the orders table: the long form is one
    row per (user, status), the wide form is one row per user.
    The native PIVOT and CASE WHEN should produce the same totals.
    """
    _run_script(con, "modules/02-sql-advanced/src/ch04_pivot_unpivot.sql")
    # the PIVOT result has one row per user
    n_pivoted = con.execute("""
        SELECT COUNT(*) FROM (
          SELECT * FROM (
            SELECT user_id, status, total FROM ods.orders
          )
          PIVOT (
            SUM(total) FOR status IN ('completed', 'paid', 'shipped', 'cancelled')
          ) AS p (user_id, completed, paid, shipped, cancelled)
        )
    """).fetchone()[0]
    assert n_pivoted > 0
    # CASE WHEN equivalent
    n_case = con.execute("""
        SELECT COUNT(*) FROM (
          SELECT user_id FROM ods.orders
          WHERE status IN ('completed','paid','shipped','cancelled')
          GROUP BY user_id
        )
    """).fetchone()[0]
    assert n_pivoted == n_case


def test_ch04_pivot_sums_match(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch04_pivot_unpivot.sql")
    native = con.execute("""
        SELECT SUM(completed), SUM(paid), SUM(shipped), SUM(cancelled)
        FROM (
          SELECT * FROM (
            SELECT user_id, status, total FROM ods.orders
          )
          PIVOT (
            SUM(total) FOR status IN ('completed', 'paid', 'shipped', 'cancelled')
          ) AS p (user_id, completed, paid, shipped, cancelled)
        )
    """).fetchone()
    case_when = con.execute("""
        SELECT
          SUM(CASE WHEN status='completed' THEN total END),
          SUM(CASE WHEN status='paid'      THEN total END),
          SUM(CASE WHEN status='shipped'   THEN total END),
          SUM(CASE WHEN status='cancelled' THEN total END)
        FROM ods.orders
    """).fetchone()
    for n, c in zip(native, case_when):
        assert round(n or 0, 2) == round(c or 0, 2)


# ---------- ch05: LATERAL ----------------------------------------

def test_ch05_lateral_top3_per_user(con) -> None:
    _run_script(con, "modules/02-sql-advanced/src/ch05_lateral.sql")
    n_lat = con.execute("""
        SELECT COUNT(*) FROM ods.users u
        JOIN LATERAL (
          SELECT order_id FROM ods.orders o
          WHERE o.user_id = u.user_id
          ORDER BY order_ts DESC LIMIT 3
        ) r ON TRUE
    """).fetchone()[0]
    n_eq = con.execute("""
        SELECT COUNT(*) FROM ods.users u
        JOIN (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_ts DESC) rn
          FROM ods.orders
        ) r ON r.user_id = u.user_id AND r.rn <= 3
    """).fetchone()[0]
    assert n_lat == n_eq
