"""Module 01 / tests — the concept demo scripts must run and assert."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data" / "small"
sys.path.insert(0, str(ROOT))
from shared.sql_runner import _split_statements  # noqa: E402


def _run(sql: str) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    con.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        con.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    for stmt in _split_statements(sql):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        con.execute(s)
    return con


# ---------- ch01: OLAP-style aggregation is fast ------------------

def test_olap_query_runs_quickly() -> None:
    con = duckdb.connect(":memory:")
    t0 = time.perf_counter()
    df = con.execute(
        "SELECT status, COUNT(*) n, SUM(total) gmv "
        "FROM read_parquet(?) GROUP BY status",
        [str(DATA / "orders.parquet")],
    ).df()
    dt = (time.perf_counter() - t0) * 1000
    assert dt < 200, f"aggregation too slow: {dt:.1f} ms"
    assert df["n"].sum() == 10_000
    assert df["gmv"].sum() > 0


# ---------- ch02: 3NF split yields same join ----------------------

def test_3nf_split() -> None:
    con = _run((ROOT / "modules/01-concepts/src/ex02_3nf.sql").read_text())
    before = con.execute("SELECT COUNT(*) FROM orders_bad").fetchone()[0]
    after = con.execute("SELECT COUNT(*) FROM fact_orders").fetchone()[0]
    assert before == after


# ---------- ch03: star and snowflake return same numbers ----------

def test_star_and_snowflake_match() -> None:
    con = _run((ROOT / "modules/01-concepts/src/ex03_star_vs_snowflake.sql").read_text())
    star = con.execute(
        "SELECT year, month, category, SUM(orders) o, ROUND(SUM(gmv),2) g "
        "FROM ("
        "  SELECT d.year, d.month, p.category, COUNT(*) orders, SUM(f.total) gmv "
        "  FROM fact_orders_star f "
        "  JOIN dim_user_star  u ON f.user_id = u.user_id "
        "  JOIN dim_product_star p ON f.product_id = p.product_id "
        "  JOIN dim_date_star  d ON f.date_key = d.date_key "
        "  GROUP BY 1,2,3"
        ") GROUP BY 1,2,3 ORDER BY 1,2,3"
    ).df()
    snow = con.execute(
        "SELECT year, category, sub_category, SUM(orders) o, ROUND(SUM(gmv),2) g "
        "FROM ("
        "  SELECT d.year, c.category, c.sub_category, COUNT(*) orders, SUM(f.total) gmv "
        "  FROM fact_orders_star f "
        "  JOIN dim_product_snow p ON f.product_id = p.product_id "
        "  JOIN dim_category_snow c ON p.category=c.category AND p.sub_category=c.sub_category "
        "  JOIN dim_date_star    d ON f.date_key = d.date_key "
        "  GROUP BY 1,2,3"
        ") GROUP BY 1,2,3 ORDER BY 1,2,3"
    ).df()
    assert round(star["o"].sum()) == round(snow["o"].sum())
    assert round(star["g"].sum(), 2) == round(snow["g"].sum(), 2)


# ---------- ch04: SCD-2 basic (full coverage in test_scd2.py) -----

def test_scd2_basic() -> None:
    con = _run((ROOT / "modules/01-concepts/src/ex04_scd2.sql").read_text())
    bad = con.execute(
        "SELECT COUNT(*) FROM ("
        "  SELECT user_id, COUNT(*) c FROM dim_user_scd2 "
        "  WHERE is_current GROUP BY user_id HAVING c > 1"
        ")"
    ).fetchone()[0]
    assert bad == 0


# ---------- ch05: layered warehouse reconciles --------------------

def test_layered_warehouse_reconciles() -> None:
    con = _run((ROOT / "modules/01-concepts/src/ex05_layered_naming.sql").read_text())
    dwd_sum = con.execute("SELECT ROUND(SUM(total),2) FROM dwd.orders").fetchone()[0]
    dws_sum = con.execute(
        "SELECT ROUND(SUM(order_amount),2) FROM dws.user_order_1d"
    ).fetchone()[0]
    dwt_sum = con.execute(
        "SELECT ROUND(SUM(lifetime_amount),2) FROM dwt.user_topic"
    ).fetchone()[0]
    assert dwd_sum == dws_sum == dwt_sum


def test_layered_user_summary_has_one_row_per_user() -> None:
    con = _run((ROOT / "modules/01-concepts/src/ex05_layered_naming.sql").read_text())
    bad = con.execute(
        "SELECT COUNT(*) FROM ("
        "  SELECT user_id, COUNT(*) c FROM ads.user_summary "
        "  GROUP BY user_id HAVING c > 1"
        ")"
    ).fetchone()[0]
    assert bad == 0


# ---------- ch06: Data Vault hub/link/sat loads --------------

def test_data_vault_load() -> None:
    con = _run((ROOT / "modules/01-concepts/src/ex06_data_vault.sql").read_text())
    n_hub = con.execute("SELECT COUNT(*) FROM hub_user").fetchone()[0]
    n_sat = con.execute("SELECT COUNT(*) FROM sat_user").fetchone()[0]
    n_link = con.execute("SELECT COUNT(*) FROM link_order").fetchone()[0]
    assert n_hub == 1_000
    assert n_sat == 1_000
    assert n_link == 10_000


# ---------- ch07: OBT has all feature columns ----------------

def test_obt_has_all_features() -> None:
    con = _run((ROOT / "modules/01-concepts/src/ex07_obt.sql").read_text())
    cols = {r[0] for r in con.execute(
        "DESCRIBE ads.user_obt"
    ).fetchall()}
    for c in ["order_count_total", "order_amount_total",
              "pv_count", "cart_count", "fav_count", "pay_count"]:
        assert c in cols, f"OBT missing {c}"
