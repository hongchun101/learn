"""Portable SQL execution harness.

A thin wrapper over DuckDB that other modules use to:
- register the demo dataset once,
- run a SQL file and return a pandas DataFrame,
- run a SQL string and return a DataFrame,
- run an idempotent DDL/DML pipeline.

DuckDB is the **reference engine** for this curriculum. Other engines
(Hive, Spark, Trino, Flink) implement the same SQL contract but
expose it through their own modules' run helpers.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable

import duckdb
import pandas as pd

DEFAULT_DATA_DIR = Path("data") / "small"


class SqlRunner:
    """A single connection to a DuckDB file, with the demo data loaded."""

    def __init__(self, db_path: str | os.PathLike = ":memory:",
                 data_dir: str | os.PathLike | None = None) -> None:
        self.con = duckdb.connect(str(db_path))
        if data_dir is not None:
            self.load_data(Path(data_dir))

    # -- raw passthroughs -----------------------------------------

    def execute(self, sql: str) -> duckdb.DuckDBPyRelation:
        return self.con.execute(sql)

    def sql(self, sql: str) -> duckdb.DuckDBPyRelation:
        """Alias for execute; matches DuckDB's own client API."""
        return self.con.sql(sql)

    def df(self, sql: str) -> pd.DataFrame:
        return self.con.execute(sql).df()

    def fetchone(self, sql: str) -> tuple | None:
        return self.con.execute(sql).fetchone()

    def close(self) -> None:
        self.con.close()

    # -- data loading ---------------------------------------------

    def load_data(self, data_dir: Path) -> None:
        """Load every Parquet file in data_dir into ods.<stem>."""
        self.con.execute("CREATE SCHEMA IF NOT EXISTS ods")
        for path in sorted(data_dir.glob("*.parquet")):
            self.con.execute(
                f"CREATE OR REPLACE TABLE ods.{path.stem} AS "
                f"SELECT * FROM read_parquet('{path.as_posix()}')"
            )
    def reset_ods(self, data_dir: Path) -> None:
        self.con.execute("CREATE SCHEMA IF NOT EXISTS ods")
        for path in sorted(data_dir.glob("*.parquet")):
            self.con.execute(f"DROP TABLE IF EXISTS ods.{path.stem}")
        self.load_data(data_dir)

    # -- file execution -------------------------------------------

    def run_file(self, sql_path: str | os.PathLike) -> None:
        """Execute a .sql file. Supports `;`-separated statements."""
        text = Path(sql_path).read_text(encoding="utf-8")
        self.run_script(text)

    def run_script(self, sql: str) -> None:
        """Execute a multi-statement SQL script (best-effort split on ';')."""
        for stmt in _split_statements(sql):
            s = stmt.strip()
            if not s or s.startswith("--"):
                continue
            self.con.execute(s)

    # -- assertions -----------------------------------------------

    def assert_eq(self, actual_sql: str, expected: object,
                  msg: str = "") -> None:
        got = self.fetchone(actual_sql)
        assert got is not None, f"no rows: {actual_sql}"
        if isinstance(expected, (int, float, str)):
            assert got[0] == expected, (
                f"expected {expected!r}, got {got[0]!r} :: {msg}"
            )
        elif isinstance(expected, (list, tuple)):
            assert list(got) == list(expected), (
                f"expected {expected!r}, got {list(got)!r} :: {msg}"
            )
        else:
            raise TypeError(f"unsupported expected type: {type(expected)}")

    def assert_invariants(self, invariants: Iterable[tuple[str, str]]) -> None:
        """Each invariant is (description, sql that must return one row)."""
        for desc, sql in invariants:
            n = self.fetchone(f"SELECT COUNT(*) FROM ({sql})")[0]
            assert n == 1, f"invariant failed: {desc} :: produced {n} rows"


def _split_statements(sql: str) -> list[str]:
    """Split on `;` outside of single-quoted strings and outside
    `--` line comments.
    """
    # Strip `--` line comments first.
    cleaned_lines = []
    for line in sql.splitlines():
        if line.lstrip().startswith("--"):
            continue
        # also strip trailing `-- ...` on a code line
        idx = line.find("--")
        if idx >= 0 and not _inside_string(line, idx):
            line = line[:idx]
        cleaned_lines.append(line)
    cleaned = "\n".join(cleaned_lines)

    out, buf, in_str = [], [], False
    for ch in cleaned:
        if ch == "'" and (not buf or buf[-1] != "\\"):
            in_str = not in_str
        if ch == ";" and not in_str:
            out.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    if buf:
        out.append("".join(buf))
    return out


def _inside_string(s: str, idx: int) -> bool:
    """Return True iff idx in s falls inside a single-quoted string."""
    in_str = False
    i = 0
    while i < idx and i < len(s):
        if s[i] == "'" and (i == 0 or s[i - 1] != "\\"):
            in_str = not in_str
        i += 1
    return in_str


@contextmanager
def ephemeral(data_dir: Path | None = None):
    """Context manager: fresh in-memory DuckDB with demo data loaded."""
    r = SqlRunner(":memory:", data_dir)
    try:
        yield r
    finally:
        r.close()
