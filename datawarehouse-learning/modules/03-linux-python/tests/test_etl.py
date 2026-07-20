"""Module 03 / tests — the ETL template must run end-to-end."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import duckdb
import pyarrow.parquet as pq
import pytest

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "modules/03-linux-python/src/ex05_etl_template.py"
DATA = ROOT / "data" / "small" / "orders.parquet"


def test_etl_runs_end_to_end(tmp_path: Path) -> None:
    """Run the ETL CLI as a subprocess; verify output Parquet is correct."""
    dst = tmp_path / "dwd_orders.parquet"
    result = subprocess.run(
        [sys.executable, str(SRC), "--src", str(DATA), "--dst", str(dst)],
        capture_output=True, text=True, env={**__import__("os").environ,
                                             "LOG_LEVEL": "WARNING"},
    )
    assert result.returncode == 0, result.stderr
    assert dst.exists()

    # load the output
    out = pq.read_table(dst)
    assert "order_id" in out.schema.names
    assert "user_id" in out.schema.names
    assert "total" in out.schema.names
    assert "status" in out.schema.names
    assert "dt" in out.schema.names

    # row count <= source row count (dedup)
    src = pq.read_table(DATA)
    assert out.num_rows <= src.num_rows


def test_etl_idempotent(tmp_path: Path) -> None:
    """Running twice produces the same output."""
    dst1 = tmp_path / "a.parquet"
    dst2 = tmp_path / "b.parquet"
    env = {**__import__("os").environ, "LOG_LEVEL": "WARNING"}
    subprocess.run([sys.executable, str(SRC), "--src", str(DATA), "--dst", str(dst1)],
                   capture_output=True, env=env, check=True)
    subprocess.run([sys.executable, str(SRC), "--src", str(DATA), "--dst", str(dst2)],
                   capture_output=True, env=env, check=True)
    n1 = pq.read_table(dst1).num_rows
    n2 = pq.read_table(dst2).num_rows
    assert n1 == n2


def test_etl_status_conformed(tmp_path: Path) -> None:
    """After ETL, every status is in the allowed set."""
    dst = tmp_path / "dwd.parquet"
    env = {**__import__("os").environ, "LOG_LEVEL": "WARNING"}
    subprocess.run([sys.executable, str(SRC), "--src", str(DATA), "--dst", str(dst)],
                   capture_output=True, env=env, check=True)
    bad = duckdb.connect(":memory:").execute(f"""
        SELECT COUNT(*) FROM read_parquet('{dst.as_posix()}')
        WHERE status NOT IN ('created','paid','shipped',
                             'completed','cancelled','refunded','unknown')
    """).fetchone()[0]
    assert bad == 0
