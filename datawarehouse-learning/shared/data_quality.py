"""Data quality rules — engine-agnostic, SQL-implementable.

Every rule is a SQL fragment that can be embedded in a query against
any table to produce a row when the rule is violated. The Python
helpers below iterate rules over a target table and aggregate
violations.

This is the small core of a DQ framework. A real platform (Great
Expectations, Soda, Deequ) does the same thing with more features
and a UI on top.
"""
from __future__ import annotations

import operator
from dataclasses import dataclass, field
from typing import Callable, Sequence

import pandas as pd

# A "rule" produces a SQL expression that, when wrapped in a query,
# returns one row per violation. The expectation is that a "healthy"
# table produces 0 rows.

@dataclass
class Rule:
    name: str
    sql: str                       # the WHERE-clause fragment
    severity: str = "error"        # "error" | "warn"
    description: str = ""

    def as_query(self, table: str) -> str:
        return f"SELECT * FROM {table} WHERE {self.sql}"


@dataclass
class RuleSet:
    rules: list[Rule] = field(default_factory=list)

    def add(self, rule: Rule) -> "RuleSet":
        self.rules.append(rule)
        return self

    def not_null(self, col: str, severity: str = "error") -> "RuleSet":
        return self.add(Rule(
            name=f"{col}_not_null",
            sql=f"{col} IS NULL",
            severity=severity,
            description=f"{col} must not be NULL",
        ))

    def unique(self, col: str, severity: str = "error") -> "RuleSet":
        return self.add(Rule(
            name=f"{col}_unique",
            sql=f"{col} IN (SELECT {col} FROM {col}_dupes_holder)",
            severity=severity,
            description=f"{col} must be unique",
        ))

    def in_set(self, col: str, allowed: Sequence[str], severity: str = "error") -> "RuleSet":
        quoted = ", ".join(f"'{v}'" for v in allowed)
        return self.add(Rule(
            name=f"{col}_in_set",
            sql=f"{col} IS NOT NULL AND {col} NOT IN ({quoted})",
            severity=severity,
            description=f"{col} must be one of {list(allowed)}",
        ))

    def range_check(self, col: str, lo: float, hi: float,
                    severity: str = "error") -> "RuleSet":
        return self.add(Rule(
            name=f"{col}_range",
            sql=f"{col} < {lo} OR {col} > {hi}",
            severity=severity,
            description=f"{col} must be in [{lo}, {hi}]",
        ))

    def freshness(self, col: str, max_age_hours: int,
                  severity: str = "error") -> "RuleSet":
        return self.add(Rule(
            name=f"{col}_freshness",
            sql=(
                f"{col} IS NULL OR {col} < (CURRENT_TIMESTAMP - "
                f"INTERVAL {max_age_hours} HOUR)"
            ),
            severity=severity,
            description=f"{col} must be within {max_age_hours} hours",
        ))

    def row_count_min(self, n: int, severity: str = "error") -> "RuleSet":
        return self.add(Rule(
            name=f"row_count_min_{n}",
            sql="1=0",  # populated dynamically
            severity=severity,
            description=f"row count >= {n}",
        ))


def _eval_sql_on_df(r: Rule, df: pd.DataFrame) -> int:
    """Translate a SQL WHERE fragment to a pandas Series of bool.

    Supports a small subset:
      - `<col> IS NULL`
      - `<col> IS NOT NULL`
      - `<col> <op> <literal>` where <op> in {=, !=, <, <=, >, >=, <>, IN, NOT IN}
      - boolean combinations with AND / OR / NOT

    Anything more complex falls back to running it as SQL against a
    temporary DuckDB table.
    """
    import re
    import duckdb

    expr = r.sql
    # Translate SQL operators to pandas-friendly ones.
    expr = re.sub(r"\bIS NULL\b", "isna()", expr, flags=re.IGNORECASE)
    expr = re.sub(r"\bIS NOT NULL\b", "notna()", expr, flags=re.IGNORECASE)
    expr = re.sub(r"\bAND\b", "&", expr, flags=re.IGNORECASE)
    expr = re.sub(r"\bOR\b", "|", expr, flags=re.IGNORECASE)
    expr = re.sub(r"\bNOT\b", "~", expr, flags=re.IGNORECASE)
    # IN ('a', 'b', ...) -> isin(['a', 'b'])
    def repl_in(m: re.Match) -> str:
        col = m.group(1)
        items = m.group(2)
        vals = [s.strip().strip("'").strip('"') for s in items.split(",") if s.strip()]
        return f"{col}.isin({vals!r})"
    expr = re.sub(r"(\w+)\s+IN\s*\(([^)]+)\)", repl_in, expr, flags=re.IGNORECASE)
    expr = re.sub(r"\bNOT\s+IN\s*\(", ".isin(", expr, flags=re.IGNORECASE)
    # Wrap bare column references in df['col']; only safe for simple
    # expressions, hence the fallback to DuckDB for anything complex.
    try:
        # naive: wrap any word that's not a Python keyword / function call
        # token. This is heuristic and only works for the simple cases
        # in our rules.
        local_ns = {"df": df}
        safe = re.sub(
            r"([A-Za-z_]\w*)\s*(?=\.isin\(|\.isna\(|\.notna\()", r"df['\1']", expr
        )
        mask = eval(safe, {"__builtins__": {}}, local_ns)
        return int(mask.sum())
    except Exception:
        # Fallback: push the DataFrame through DuckDB.
        con = duckdb.connect(":memory:")
        con.register("df_view", df)
        try:
            n = con.execute(
                f"SELECT COUNT(*) FROM df_view WHERE {r.sql}"
            ).fetchone()[0]
            return int(n)
        finally:
            con.close()


def evaluate(rules: RuleSet, df: pd.DataFrame) -> pd.DataFrame:
    """Run each rule against a pandas DataFrame.

    Returns a DataFrame of violations: rule, severity, count, sample.
    """
    rows = []
    for r in rules.rules:
        if r.name.startswith("row_count_min"):
            count = 1 if len(df) < int(r.name.rsplit("_", 1)[-1]) else 0
        else:
            count = _eval_sql_on_df(r, df)
        if count:
            rows.append(dict(
                rule=r.name, severity=r.severity, count=count,
                description=r.description,
            ))
    return pd.DataFrame(rows)


# Helpers that work directly on a SqlRunner --------------------------------

def evaluate_sql(rules: RuleSet, runner, table: str) -> pd.DataFrame:
    """Run each rule via SQL; return a DataFrame of violations."""
    rows = []
    for r in rules.rules:
        sql = r.as_query(table)
        n = runner.fetchone(f"SELECT COUNT(*) FROM ({sql})")[0]
        if n:
            rows.append(dict(
                rule=r.name, severity=r.severity, count=n,
                description=r.description,
            ))
    return pd.DataFrame(rows)


# A small library of canonical rule sets --------------------------------

def orders_rules() -> RuleSet:
    rs = RuleSet()
    rs.not_null("order_id")
    rs.not_null("user_id")
    rs.not_null("total")
    rs.in_set("status", ["created", "paid", "shipped", "completed", "cancelled", "refunded"])
    rs.range_check("total", 0, 1_000_000)
    rs.row_count_min(1)
    return rs


def user_events_rules() -> RuleSet:
    rs = RuleSet()
    rs.not_null("event_id")
    rs.not_null("user_id")
    rs.not_null("event_ts")
    rs.in_set("event_type", ["pv", "cart", "fav", "pay"])
    return rs
