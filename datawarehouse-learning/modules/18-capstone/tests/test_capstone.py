import sys
from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from shared.data_quality import evaluate, orders_rules
from shared.sql_runner import _split_statements

DATA = ROOT / "data" / "small"
PIPELINE = "modules/18-capstone/src/capstone_pipeline.sql"


@pytest.fixture()
def con():
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} "
            f"AS SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    _run_script(c, PIPELINE)
    return c


def _run_script(con, sql_path):
    text = (ROOT / sql_path).read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        if s.upper().startswith("EXPLAIN"):
            continue
        con.execute(s)


def test_ods_to_dwd_is_deduplicated_and_reconciled(con):
    ods_rows, distinct_ids, dwd_rows = con.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM ods.orders),
          (SELECT COUNT(DISTINCT order_id) FROM ods.orders
             WHERE order_id IS NOT NULL AND user_id IS NOT NULL AND total IS NOT NULL),
          (SELECT COUNT(*) FROM dwd.orders)
        """
    ).fetchone()
    assert dwd_rows == distinct_ids
    assert dwd_rows <= ods_rows
    assert con.execute("SELECT COUNT(*) FROM dwd.orders WHERE dt IS NULL").fetchone()[0] == 0


def test_dwd_to_dws_user_day_grain_and_amount(con):
    duplicate_grains, mismatches = con.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM (
             SELECT user_id, dt FROM dws.user_order_1d
             GROUP BY user_id, dt HAVING COUNT(*) > 1)),
          (SELECT COUNT(*)
             FROM dws.user_order_1d s
             JOIN (
               SELECT user_id, dt, SUM(total) AS expected_amount, COUNT(*) AS expected_count
               FROM dwd.orders GROUP BY user_id, dt
             ) d USING (user_id, dt)
            WHERE s.order_amount <> d.expected_amount
               OR s.order_count <> d.expected_count)
        """
    ).fetchone()
    assert duplicate_grains == 0
    assert mismatches == 0


def test_end_to_end_amounts_reconcile_at_every_layer(con):
    dwd, dws, dwt, ads = con.execute(
        """
        SELECT
          (SELECT SUM(total) FROM dwd.orders),
          (SELECT SUM(order_amount) FROM dws.user_order_1d),
          (SELECT SUM(lifetime_amount) FROM dwt.user_topic),
          (SELECT SUM(gmv) FROM ads.gmv_daily)
        """
    ).fetchone()
    assert float(dwd) == pytest.approx(float(dws), abs=0.01)
    assert float(dwd) == pytest.approx(float(dwt), abs=0.01)
    assert float(dwd) == pytest.approx(float(ads), abs=0.01)


def test_scd2_and_referential_integrity(con):
    bad_current_rows, orphan_orders = con.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM (
             SELECT user_id FROM dim.user_scd2 WHERE is_current
             GROUP BY user_id HAVING COUNT(*) <> 1)),
          (SELECT COUNT(*) FROM dwd.orders o
             LEFT JOIN dim.user_scd2 u ON o.user_id = u.user_id AND u.is_current
            WHERE u.user_id IS NULL)
        """
    ).fetchone()
    assert bad_current_rows == 0
    assert orphan_orders == 0


def test_shared_data_quality_rules_and_audit_pass(con):
    frame = con.execute("SELECT * FROM dwd.orders").df()
    violations = evaluate(orders_rules(), frame)
    assert violations.empty
    assert con.execute(
        "SELECT SUM(violation_count) FROM ads.data_quality_audit WHERE severity = 'error'"
    ).fetchone()[0] == 0
    assert con.execute("SELECT COUNT(*) FROM ads.data_quality_audit").fetchone()[0] == 6


def test_anomaly_detection_flags_injected_ten_x_order(con):
    user_id, user_avg = con.execute(
        "SELECT user_id, AVG(total) FROM dwd.orders WHERE user_id = "
        "(SELECT user_id FROM dwd.orders WHERE order_id = 1) GROUP BY user_id"
    ).fetchone()
    injected_id = 90000001
    injected_total = float(user_avg) * 200
    con.execute(
        "INSERT INTO ods.orders VALUES (?, ?, ?, 'paid', DATE '2024-12-31', TIMESTAMP '2024-12-31 23:59:59')",
        [injected_id, user_id, injected_total],
    )
    _run_script(con, PIPELINE)
    row = con.execute(
        "SELECT is_anomaly, amount_to_average_ratio FROM ads.order_anomalies WHERE order_id = ?",
        [injected_id],
    ).fetchone()
    assert row[0] is True
    assert float(row[1]) > 10
    assert con.execute(
        "SELECT COUNT(*) FROM ads.order_anomalies WHERE is_anomaly <> (total > 10 * user_avg_amount)"
    ).fetchone()[0] == 0


def test_rfm_contains_all_users_and_five_valid_bins(con):
    users, rfm_users, score_min, score_max, invalid_codes = con.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM ods.users),
          (SELECT COUNT(*) FROM ads.user_rfm),
          (SELECT MIN(LEAST(r_score, f_score, m_score)) FROM ads.user_rfm),
          (SELECT MAX(GREATEST(r_score, f_score, m_score)) FROM ads.user_rfm),
          (SELECT COUNT(*) FROM ads.user_rfm
            WHERE LENGTH(rfm_code) <> 3
               OR segment NOT IN ('champions', 'loyal', 'potential', 'at_risk', 'regular'))
        """
    ).fetchone()
    assert rfm_users == users
    assert (score_min, score_max) == (1, 5)
    assert invalid_codes == 0
    assert con.execute("SELECT COUNT(DISTINCT r_score) FROM ads.user_rfm").fetchone()[0] == 5


def test_daily_kpi_dashboard_matches_orders_and_events(con):
    days, bad_rows = con.execute(
        """
        SELECT
          (SELECT COUNT(DISTINCT dt) FROM dwd.orders),
          (SELECT COUNT(*) FROM ads.daily_kpi k
            LEFT JOIN (
              SELECT dt, SUM(total) AS amount, COUNT(*) AS orders
              FROM dwd.orders GROUP BY dt
            ) o USING (dt)
            LEFT JOIN (
              SELECT dt,
                SUM(CASE WHEN event_type = 'pv' THEN 1 ELSE 0 END) AS pv,
                SUM(CASE WHEN event_type = 'cart' THEN 1 ELSE 0 END) AS cart,
                SUM(CASE WHEN event_type = 'pay' THEN 1 ELSE 0 END) AS pay
              FROM dwd.user_events GROUP BY dt
            ) e USING (dt)
           WHERE k.gmv <> o.amount OR k.order_count <> o.orders
              OR k.pv <> COALESCE(e.pv, 0)
              OR k.cart <> COALESCE(e.cart, 0)
              OR k.pay <> COALESCE(e.pay, 0))
        """
    ).fetchone()
    assert con.execute("SELECT COUNT(*) FROM ads.daily_kpi").fetchone()[0] == days
    assert bad_rows == 0
    assert con.execute(
        "SELECT COUNT(*) FROM ads.daily_kpi WHERE average_order_value < 0 OR refund_rate_pct < 0"
    ).fetchone()[0] == 0
