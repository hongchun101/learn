"""Module 04 / Hadoop — tests.

We do NOT spin up a real HDFS cluster. We execute the demo SQL against
DuckDB, which has every parquet table loaded into ``ods.<stem>``. The
demo script (modules/04-hadoop/src/hdfs_demo.sql) builds a faithful
simulation in the ``hdfs_sim`` schema:

* datanodes / rack_topology   — ch01, ch04
* inode / blocks / replicas   — ch02, ch03, ch04
* word_count / order_status_* — ch06 (MapReduce emulation)
* yarn_queues / yarn_apps     — ch05
* ecosystem / workload_fit    — ch07, ch08

Each test asserts ONE observable contract so a failure points right at
the broken section.
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
SQL_PATH = "modules/04-hadoop/src/hdfs_demo.sql"


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    # run the demo once per test so views are freshly built
    text = (ROOT / SQL_PATH).read_text(encoding="utf-8")
    for stmt in _split_statements(text):
        s = stmt.strip()
        if not s or s.startswith("--"):
            continue
        if s.upper().startswith("EXPLAIN"):
            continue
        c.execute(s)
    return c


# ---------------------------------------------------------------------
# ch01 + ch03 — cluster topology and block layout
# ---------------------------------------------------------------------
def test_ch01_topology_has_six_datanodes_on_three_racks(con) -> None:
    n_dn = con.execute("SELECT COUNT(*) FROM hdfs_sim.datanodes").fetchone()[0]
    n_racks = con.execute(
        "SELECT COUNT(DISTINCT rack_path) FROM hdfs_sim.datanodes"
    ).fetchone()[0]
    assert n_dn == 6, f"expected 6 DataNodes, got {n_dn}"
    assert n_racks == 3, f"expected 3 racks, got {n_racks}"

    # every block is replicated to exactly 3 distinct datanodes (the
    # default dfs.replication = 3).
    distinct_replicas = con.execute(
        """
        SELECT MIN(c) AS min_r, MAX(c) AS max_r
        FROM (
            SELECT block_id, COUNT(DISTINCT dn_id) AS c
            FROM   hdfs_sim.replicas
            GROUP  BY block_id
        )
        """
    ).fetchone()
    assert distinct_replicas == (3, 3), (
        f"every block should have 3 replicas, got {distinct_replicas}"
    )


# ---------------------------------------------------------------------
# ch02 — `hdfs dfs -ls` emulation via SQL
# ---------------------------------------------------------------------
def test_ch02_hdfs_ls_lists_every_under_data_with_replication(con) -> None:
    rows = con.execute(
        "SELECT file_name, replication, total_bytes FROM hdfs_sim.v_hdfs_ls"
    ).fetchall()
    files = {r[0] for r in rows}
    expected = {
        "orders.parquet",
        "order_items.parquet",
        "users.parquet",
        "products.parquet",
    }
    assert files == expected, f"v_hdfs_ls missing files: {expected - files}"

    # every file shows replication >= 3
    for fname, repl, _size in rows:
        assert repl >= 3, f"{fname} has replication {repl} (< 3)"
    # orders is the biggest — must have more bytes than products
    by_name = {r[0]: r[2] for r in rows}
    assert by_name["orders.parquet"] > by_name["products.parquet"]


# ---------------------------------------------------------------------
# ch04 — rack-awareness: every replicated block sits on at least 2 racks
# ---------------------------------------------------------------------
def test_ch04_rack_awareness_at_least_two_racks_per_block(con) -> None:
    rows = con.execute(
        """
        SELECT b.block_id,
               COUNT(DISTINCT d.rack_path) AS racks,
               COUNT(DISTINCT r.dn_id)     AS dn_cnt
        FROM   hdfs_sim.blocks   b
        JOIN   hdfs_sim.replicas r ON r.block_id = b.block_id
        JOIN   hdfs_sim.datanodes d ON d.dn_id = r.dn_id
        GROUP  BY b.block_id
        """
    ).fetchall()
    assert rows, "no block->rack mapping produced"
    for block_id, racks, dn_cnt in rows:
        # the default policy guarantees >= 2 distinct racks for RF=3
        assert racks >= 2, f"{block_id} only on {racks} rack(s)"
        assert dn_cnt == 3, f"{block_id} has {dn_cnt} replicas (expected 3)"


# ---------------------------------------------------------------------
# ch06 — MapReduce emulation: word count + status aggregate
# ---------------------------------------------------------------------
def test_ch06_word_count_matches_user_table(con) -> None:
    # 1. the mapper projects (word, 1) per user_name row
    n_split = con.execute(
        "SELECT COUNT(*) FROM hdfs_sim.word_count_split"
    ).fetchone()[0]
    n_users = con.execute("SELECT COUNT(*) FROM ods.users").fetchone()[0]
    assert n_split == n_users, (
        f"word_count_split rows ({n_split}) != users ({n_users})"
    )

    # 2. the reducer sums per word
    n_wc = con.execute("SELECT COUNT(*) FROM hdfs_sim.word_count").fetchone()[0]
    # user_name is unique-ish: number of distinct words should be close
    n_distinct = con.execute(
        "SELECT COUNT(DISTINCT user_name) FROM ods.users"
    ).fetchone()[0]
    assert n_wc == n_distinct, (
        f"reducer produced {n_wc} words, expected {n_distinct}"
    )

    # 3. global sum of counts equals input size (no rows dropped)
    total = con.execute(
        "SELECT SUM(total) FROM hdfs_sim.word_count"
    ).fetchone()[0]
    assert total == n_users, f"sum({total}) != users({n_users})"


# ---------------------------------------------------------------------
# ch06 + ch05 + ch07 — YARN queue accounting + ecosystem + workload fit
# ---------------------------------------------------------------------
def test_ch05_ch06_ch07_yarn_and_ecosystem(con) -> None:
    # YARN queue usage — ETL queue is fully booked, default queue is free
    usage = {
        q: (used, free)
        for q, _cap, used, free in con.execute(
            "SELECT queue, capacity_mb, used_mb, free_mb "
            "FROM hdfs_sim.yarn_queue_usage"
        ).fetchall()
    }
    assert usage["root.ETL"][0] == 2048, f"ETL used {usage['root.ETL'][0]} MB"
    assert usage["root.ETL"][1] == 0
    assert usage["root.default"][0] == 0
    assert usage["root.adhoc"][0] == 512

    # ecosystem: Spark replaces MapReduce; Hive is SQL-on-Hadoop
    replaces = {
        tool: repl
        for tool, repl in con.execute(
            "SELECT tool, replaces FROM hdfs_sim.ecosystem"
        ).fetchall()
    }
    assert replaces["Spark"] == "MapReduce"
    assert replaces["Hive"] == "MapReduce"
    assert replaces["Presto/Trino"] == "Hive"

    # workload rubric: every row has the right shape
    n_fit = con.execute(
        "SELECT COUNT(*) FROM hdfs_sim.workload_fit WHERE fits_hadoop"
    ).fetchone()[0]
    n_unfit = con.execute(
        "SELECT COUNT(*) FROM hdfs_sim.workload_fit WHERE NOT fits_hadoop"
    ).fetchone()[0]
    assert n_fit >= 2 and n_unfit >= 2, (
        f"workload_fit should have >=2 of each: fit={n_fit}, unfit={n_unfit}"
    )