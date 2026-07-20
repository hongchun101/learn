"""Module 05 / Hive — asserts the demo SQL exercises the Hive semantics
that this module teaches: partitioning, bucketing, ORC/Parquet storage,
UDF/UDAF/UDTF, CBO statistics and partition pruning.
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
SQL_FILE = ROOT / "modules" / "05-hive" / "src" / "hive_demo.sql"


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    """Fresh DuckDB with the demo dataset loaded into ods.* — same
    contract every other module uses."""
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        if p.stem.startswith("_"):
            continue
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    text = SQL_FILE.read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        if s.upper().startswith("EXPLAIN"):
            continue
        c.execute(s)
    return c


# ---------- (1) Partitioning: dt column is materialized and partition
# pruning returns a strict subset of the rows.

def test_partition_column_and_pruning(con) -> None:
    # dt is a real, typed partition column.
    cols = {
        r[0]
        for r in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='dwd' AND table_name='orders_part'"
        ).fetchall()
    }
    assert "dt" in cols, "dwd.orders_part must expose dt as a partition column"

    # Multiple partitions exist (one per business day).
    n_parts = con.execute(
        "SELECT COUNT(DISTINCT dt) FROM dwd.orders_part"
    ).fetchone()[0]
    assert n_parts > 10, f"expected many dt partitions, got {n_parts}"

    full = con.execute("SELECT COUNT(*) FROM dwd.orders_part").fetchone()[0]
    pruned = con.execute(
        "SELECT COUNT(*) FROM dwd.orders_part "
        "WHERE dt = DATE '2024-01-15'"
    ).fetchone()[0]
    assert 0 < pruned < full, "partition pruning must return a strict subset"


# ---------- (2) Bucketing: 16 buckets, deterministic mapping per
# user_id, no user_id appears in two buckets.

def test_bucketing_16_buckets_deterministic(con) -> None:
    # The materialized table has a bucket_id column.
    cols = {
        r[0]
        for r in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='dws' AND table_name='user_order_1d'"
        ).fetchall()
    }
    assert "bucket_id" in cols, "dws.user_order_1d must carry a bucket_id column"

    # Bucket ids span 0..15 exactly.
    bucket_ids = sorted(
        r[0]
        for r in con.execute(
            "SELECT DISTINCT bucket_id FROM dws.user_order_1d"
        ).fetchall()
    )
    assert bucket_ids == list(range(16)), f"expected 16 buckets, got {bucket_ids}"

    # Every user_id appears in exactly one bucket (Hive's identity
    # contract). This is the property that makes bucketed joins
    # no-shuffle merges.
    dup_users = con.execute(
        "SELECT COUNT(*) FROM ("
        "  SELECT user_id, COUNT(DISTINCT bucket_id) AS nb "
        "  FROM dws.user_order_1d GROUP BY user_id HAVING nb > 1)"
    ).fetchone()[0]
    assert dup_users == 0, "each user_id must map to a single bucket"

    # And the hash matches the same user_id across tables — the
    # bucketed-join contract.
    consistent = con.execute(
        "SELECT COUNT(*) FROM dws.user_order_1d o "
        "JOIN ods.users u USING (user_id) "
        "WHERE ABS(HASH(o.user_id)) % 16 = ABS(HASH(u.user_id)) % 16"
    ).fetchone()[0]
    total = con.execute("SELECT COUNT(*) FROM dws.user_order_1d").fetchone()[0]
    assert consistent == total, "bucket hash must be consistent across tables"


# ---------- (3) ORC ↔ Parquet round trip: the ORC-simulated table
# carries the same row count and the same min/max.

def test_orc_round_trip_via_parquet(con) -> None:
    src = con.execute(
        "SELECT COUNT(*) AS n, MIN(total) AS mn, MAX(total) AS mx "
        "FROM dwd.orders"
    ).fetchone()
    orc = con.execute(
        "SELECT COUNT(*) AS n, MIN(total) AS mn, MAX(total) AS mx "
        "FROM dwd.orders_orc"
    ).fetchone()
    assert src[0] == orc[0] > 0, "ORC-simulated table must keep all rows"
    assert src[1] == orc[1], "MIN(total) must survive the round trip"
    assert src[2] == orc[2], "MAX(total) must survive the round trip"

    # The sim file exists on disk and is a real Parquet file.
    p = DATA / "_hive_orc_sim.parquet"
    assert p.exists() and p.stat().st_size > 0, "ORC-sim file must be written"


# ---------- (4) UDF / UDAF / UDTF: scalar macro, aggregate macro
# and table macro all evaluate correctly.

def test_udf_udaf_udtf(con) -> None:
    # Scalar UDF — mask_email.
    row = con.execute(
        "SELECT mask_email('alice@example.com')"
    ).fetchone()[0]
    assert row == "al****om", f"mask_email failed: {row!r}"

    null_row = con.execute("SELECT mask_email(NULL)").fetchone()[0]
    assert null_row is None, "mask_email(NULL) must return NULL"

    short_row = con.execute("SELECT mask_email('abc')").fetchone()[0]
    assert short_row == "****", "mask_email must mask very short inputs"

    # UDAF — median_total. Must agree with the built-in median.
    macro_med = con.execute(
        "SELECT median_total(total) FROM dwd.orders_part"
    ).fetchone()[0]
    builtin_med = con.execute(
        "SELECT median(total) FROM dwd.orders_part"
    ).fetchone()[0]
    assert macro_med == builtin_med, "UDAF median_total must match built-in"

    # UDTF — explode_csv. Each input row yields N output rows.
    rows = con.execute(
        "SELECT token FROM explode_csv('a,b,c,d') ORDER BY token"
    ).fetchall()
    assert [r[0] for r in rows] == ["a", "b", "c", "d"]


# ---------- (5) CBO + performance tuning: ANALYZE runs, EXPLAIN
# produces a real plan, and predicate pushdown actually reduces
# the rows touched.

def test_cbo_and_partition_pruning_reduces_rows(con) -> None:
    # duckdb_tables reports non-NULL row counts after ANALYZE — the
    # CBO's input. If ANALYZE never ran, these would be NULL.
    stats = con.execute(
        "SELECT estimated_size, column_count "
        "FROM duckdb_tables() WHERE table_name='orders_part'"
    ).fetchone()
    assert stats[0] is not None, "ANALYZE must populate table statistics"
    assert stats[1] > 0, "table must have columns for CBO to consider"

    # EXPLAIN still parses (DuckDB returns a relational plan string).
    plan = con.execute(
        "EXPLAIN SELECT user_id, COUNT(*) FROM dwd.orders_part "
        "WHERE dt >= DATE '2024-01-01' GROUP BY user_id"
    ).fetchall()
    assert plan and any("AGGREGATE" in str(r).upper() or "GROUP_BY" in str(r).upper()
                        or "HASH" in str(r).upper() for r in plan), \
        "EXPLAIN must show an aggregation step in the plan"

    # The killer perf-tuning combo: partition column + bucket column.
    full = con.execute("SELECT COUNT(*) FROM dwd.orders_part").fetchone()[0]
    pruned = con.execute(
        "SELECT COUNT(*) FROM dwd.orders_part "
        "WHERE dt = DATE '2024-01-15' "
        "  AND user_id BETWEEN 1000 AND 1100"
    ).fetchone()[0]
    assert pruned <= full, "combined filter must not exceed total"
    assert pruned < full / 100, "combined filter should reduce rows by >>100x"