"""Module 01 / ch04 — comprehensive SCD-2 tests.

Tests the full SCD-2 lifecycle:
  1. initial load
  2. source update (some attrs change)
  3. merge (close old, open new)
  4. point-in-time query
"""
from __future__ import annotations

import datetime
import duckdb
import pytest


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    """Fresh DuckDB with a small in-memory dim_user_scd2."""
    c = duckdb.connect(":memory:")
    c.execute("""
        CREATE TABLE dim_user_scd2 (
          user_id      BIGINT,
          user_name    VARCHAR,
          level        VARCHAR,
          valid_from   DATE,
          valid_to     DATE,
          is_current   BOOLEAN,
          PRIMARY KEY (user_id, valid_from)
        )
    """)
    c.execute("""
        INSERT INTO dim_user_scd2 VALUES
          (1, 'alice', 'bronze',   DATE '2024-01-01', DATE '9999-12-31', TRUE),
          (2, 'bob',   'silver',   DATE '2024-01-01', DATE '9999-12-31', TRUE),
          (3, 'carol', 'bronze',   DATE '2024-01-01', DATE '9999-12-31', TRUE)
    """)
    return c


def _scd2_merge(con, src_changes: list[tuple]) -> None:
    """Apply a list of SCD-2 changes to dim_user_scd2.

    Each tuple is (user_id, user_name, level, effective_dt). For each
    change we (a) close the current row, then (b) insert the new row.
    Changes are processed in input order; when multiple changes
    affect the same user we process them sequentially, so the
    is_current invariant always holds.
    """
    for (uid, uname, level, eff) in src_changes:
        # (a) close current row if its level/name differ
        con.execute(
            """
            UPDATE dim_user_scd2
            SET valid_to = ? - INTERVAL 1 DAY,
                is_current = FALSE
            WHERE user_id = ? AND is_current
              AND (level <> ? OR user_name <> ?)
            """,
            [eff, uid, level, uname],
        )
        # (b) insert new row IF no current row exists with the new level/name
        con.execute(
            """
            INSERT INTO dim_user_scd2
            SELECT ?, ?, ?, ?, DATE '9999-12-31', TRUE
            WHERE NOT EXISTS (
                SELECT 1 FROM dim_user_scd2 d
                WHERE d.user_id = ? AND d.is_current
            )
            """,
            [uid, uname, level, eff, uid],
        )


# ---------- (1) initial: one current per user ----------

def test_initial_one_current_per_user(con) -> None:
    bad = con.execute("""
        SELECT COUNT(*) FROM (
          SELECT user_id, COUNT(*) c
          FROM dim_user_scd2 WHERE is_current
          GROUP BY user_id HAVING c > 1
        )
    """).fetchone()[0]
    assert bad == 0


# ---------- (2) merge: 1 user changes level ----------

def test_merge_closes_old_opens_new(con) -> None:
    _scd2_merge(con, [
        (1, 'alice', 'gold',  datetime.date(2024, 6, 1)),
    ])
    rows = con.execute("""
        SELECT user_name, level, valid_from, valid_to, is_current
        FROM dim_user_scd2 WHERE user_id = 1
        ORDER BY valid_from
    """).fetchall()
    assert len(rows) == 2
    assert rows[0] == ('alice', 'bronze', datetime.date(2024, 1, 1), datetime.date(2024, 5, 31), False)
    assert rows[1] == ('alice', 'gold',   datetime.date(2024, 6, 1), datetime.date(9999, 12, 31), True)

    # users 2 and 3 unchanged
    for uid in (2, 3):
        n = con.execute(
            "SELECT COUNT(*) FROM dim_user_scd2 WHERE user_id = ?", [uid]
        ).fetchone()[0]
        assert n == 1


# ---------- (3) merge: no-op when attrs didn't change ----------

def test_noop_when_attrs_unchanged(con) -> None:
    _scd2_merge(con, [
        (2, 'bob', 'silver', datetime.date(2024, 6, 15)),   # same level
    ])
    n = con.execute("SELECT COUNT(*) FROM dim_user_scd2 WHERE user_id = 2").fetchone()[0]
    assert n == 1, "no-op merge should not insert a new row"


# ---------- (4) point-in-time query ----------

def test_point_in_time_query(con) -> None:
    _scd2_merge(con, [
        (1, 'alice', 'gold',  datetime.date(2024, 6, 1)),
        (3, 'carol', 'gold',  datetime.date(2024, 7, 1)),
    ])
    rows = dict(con.execute("""
        SELECT user_id, level
        FROM dim_user_scd2
        WHERE DATE '2024-05-01' BETWEEN valid_from AND valid_to
    """).fetchall())
    assert rows[1] == 'bronze'
    assert rows[2] == 'silver'
    assert rows[3] == 'bronze'

    rows = dict(con.execute("""
        SELECT user_id, level
        FROM dim_user_scd2
        WHERE DATE '2024-08-01' BETWEEN valid_from AND valid_to
    """).fetchall())
    assert rows[1] == 'gold'
    assert rows[3] == 'gold'


# ---------- (5) merge: multiple changes for one user ----------

def test_multi_change_merge(con) -> None:
    _scd2_merge(con, [
        (1, 'alice', 'gold',     datetime.date(2024, 3, 1)),
        (2, 'bob',   'gold',     datetime.date(2024, 4, 1)),
        (1, 'alice', 'platinum', datetime.date(2024, 8, 1)),
    ])
    n = con.execute("SELECT COUNT(*) FROM dim_user_scd2 WHERE user_id = 1").fetchone()[0]
    assert n == 3
    cur = con.execute(
        "SELECT level FROM dim_user_scd2 WHERE user_id = 1 AND is_current"
    ).fetchone()[0]
    assert cur == 'platinum'
    # invariant: at most one is_current per user
    bad = con.execute("""
        SELECT COUNT(*) FROM (
          SELECT user_id FROM dim_user_scd2 WHERE is_current
          GROUP BY user_id HAVING COUNT(*) > 1
        )
    """).fetchone()[0]
    assert bad == 0
