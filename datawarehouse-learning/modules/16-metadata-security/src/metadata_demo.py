"""Module 16 — 元数据与数据安全演示 (Metadata & Security demo).

A self-contained simulation of an enterprise metadata catalog with the
four capabilities this module teaches:

  1. 元数据管理 (catalog)        — tables, columns, types, owners, tags
  2. 数据血缘 (lineage)          — column-level lineage graph + BFS reach
  3. 数据脱敏 (column masking)   — declarative masking policies applied via SQL
  4. 行级权限 (row-level security) — predicate-based row filters per role
  5. 审计 (audit log)            — append-only event journal

The catalog is built entirely inside DuckDB (`metadata.*` schema) so the
demo runs anywhere DuckDB runs — no cluster, no Kafka, no Metastore. The
shape mirrors what DataHub / Atlas / Glue Catalog store, but is small
enough to read in one sitting.

CLI:
    python metadata_demo.py            # runs end-to-end, prints a summary
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import duckdb

UTC = timezone.utc

# ---------------------------------------------------------------------------
# Catalog schema
# ---------------------------------------------------------------------------

CATALOG_SCHEMA = "metadata"

# Column-level tags used for masking. Mirrors what DataHub/Atlas attach.
PII_TAGS = {"pii", "email", "phone", "id_card"}

# Built-in roles for row-level security. New roles can be added at runtime.
DEFAULT_ROLES = ("analyst", "support", "admin")


# ---------------------------------------------------------------------------
# Domain types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ColumnDef:
    name: str
    dtype: str
    nullable: bool = True
    description: str = ""
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class TableDef:
    layer: str          # "ods" / "dwd" / "dws" / "ads" / "dim"
    name: str           # bare name, e.g. "orders"
    columns: tuple[ColumnDef, ...]
    owner: str = "data-platform"
    description: str = ""

    @property
    def fqname(self) -> str:
        return f"{self.layer}.{self.name}"


@dataclass(frozen=True)
class LineageEdge:
    """Column-level lineage: downstream column derived from upstream column."""
    upstream: str   # e.g. "ods.orders.user_id"
    downstream: str # e.g. "dwd.orders.user_id"
    transform: str  # free-text description of how the value flows

def _utc_now() -> datetime:
    """Timezone-aware UTC now (datetime.utcnow is deprecated in 3.12+)."""
    return datetime.now(tz=UTC).replace(tzinfo=None)

@dataclass
class MaskPolicy:
    column: str
    policy: str  # one of: hash, partial_mask, redact, none
    params: dict = field(default_factory=dict)


@dataclass
class RowPolicy:
    role: str
    table: str
    predicate: str  # SQL boolean expression evaluated with role context


# ---------------------------------------------------------------------------
# The catalog itself
# ---------------------------------------------------------------------------


class MetadataCatalog:
    """A small in-DuckDB catalog that supports the demo end-to-end.

    All catalog state lives in the `metadata.*` schema of a DuckDB
    connection. The catalog exposes helpers to:

      * register tables (creates rows in `metadata.tables` and
        `metadata.columns`);
      * declare column-level lineage edges (`metadata.lineage`);
      * declare column masking policies (`metadata.masking_policies`);
      * declare row-level security policies (`metadata.row_policies`);
      * resolve upstream / downstream column lineage via BFS;
      * apply masking + row filters to any base table.
    """

    def __init__(self, con: duckdb.DuckDBPyConnection) -> None:
        self.con = con
        self._bootstrap()

    # -- DDL -------------------------------------------------------------

    def _bootstrap(self) -> None:
        c = self.con
        c.execute(f"CREATE SCHEMA IF NOT EXISTS {CATALOG_SCHEMA}")
        c.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CATALOG_SCHEMA}.tables (
                layer        VARCHAR NOT NULL,
                name         VARCHAR NOT NULL,
                owner        VARCHAR NOT NULL,
                description  VARCHAR NOT NULL,
                registered_at TIMESTAMP NOT NULL,
                PRIMARY KEY (layer, name)
            )
            """
        )
        c.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CATALOG_SCHEMA}.columns (
                layer        VARCHAR NOT NULL,
                table_name   VARCHAR NOT NULL,
                column_name  VARCHAR NOT NULL,
                data_type    VARCHAR NOT NULL,
                is_nullable  BOOLEAN NOT NULL,
                description  VARCHAR NOT NULL,
                tags         VARCHAR NOT NULL,   -- comma-separated
                PRIMARY KEY (layer, table_name, column_name)
            )
            """
        )
        c.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CATALOG_SCHEMA}.lineage (
                upstream    VARCHAR NOT NULL,   -- "layer.table.column"
                downstream  VARCHAR NOT NULL,   -- "layer.table.column"
                transform   VARCHAR NOT NULL
            )
            """
        )
        c.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CATALOG_SCHEMA}.masking_policies (
                column_fq   VARCHAR PRIMARY KEY,  -- "layer.table.column"
                policy      VARCHAR NOT NULL,    -- hash|partial_mask|redact|none
                params_json VARCHAR NOT NULL
            )
            """
        )
        c.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CATALOG_SCHEMA}.row_policies (
                role        VARCHAR NOT NULL,
                table_fq    VARCHAR NOT NULL,    -- "layer.table"
                predicate   VARCHAR NOT NULL,
                PRIMARY KEY (role, table_fq)
            )
            """
        )
        c.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CATALOG_SCHEMA}.audit_log (
                ts          TIMESTAMP NOT NULL,
                actor       VARCHAR NOT NULL,
                action      VARCHAR NOT NULL,
                target      VARCHAR NOT NULL,
                detail      VARCHAR NOT NULL
            )
            """
        )

    # -- registration ----------------------------------------------------

    def register_table(self, t: TableDef) -> None:
        """Register a table and its columns into the catalog."""
        c = self.con
        c.execute(
            f"""
            INSERT OR REPLACE INTO {CATALOG_SCHEMA}.tables
            VALUES (?, ?, ?, ?, ?)
            """,
            [t.layer, t.name, t.owner, t.description, _utc_now()],
        )
        for col in t.columns:
            c.execute(
                f"""
                INSERT OR REPLACE INTO {CATALOG_SCHEMA}.columns
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    t.layer, t.name, col.name, col.dtype, col.nullable,
                    col.description, ",".join(col.tags),
                ],
            )

    def add_lineage(self, edge: LineageEdge) -> None:
        self.con.execute(
            f"INSERT INTO {CATALOG_SCHEMA}.lineage VALUES (?, ?, ?)",
            [edge.upstream, edge.downstream, edge.transform],
        )

    def add_lineage_batch(self, edges: Iterable[LineageEdge]) -> None:
        for e in edges:
            self.add_lineage(e)

    def add_mask_policy(self, p: MaskPolicy) -> None:
        fq = p.column
        self.con.execute(
            f"""
            INSERT OR REPLACE INTO {CATALOG_SCHEMA}.masking_policies
            VALUES (?, ?, ?)
            """,
            [fq, p.policy, json.dumps(p.params)],
        )

    def add_row_policy(self, p: RowPolicy) -> None:
        self.con.execute(
            f"""
            INSERT OR REPLACE INTO {CATALOG_SCHEMA}.row_policies
            VALUES (?, ?, ?)
            """,
            [p.role, p.table, p.predicate],
        )

    def audit(self, actor: str, action: str, target: str, detail: str = "") -> None:
        self.con.execute(
            f"INSERT INTO {CATALOG_SCHEMA}.audit_log VALUES (?, ?, ?, ?, ?)",
            [_utc_now(), actor, action, target, detail],
        )

    # -- introspection ---------------------------------------------------

    def table_count(self) -> int:
        return self.con.execute(
            f"SELECT COUNT(*) FROM {CATALOG_SCHEMA}.tables"
        ).fetchone()[0]

    def column_count(self) -> int:
        return self.con.execute(
            f"SELECT COUNT(*) FROM {CATALOG_SCHEMA}.columns"
        ).fetchone()[0]

    def lineage_count(self) -> int:
        return self.con.execute(
            f"SELECT COUNT(*) FROM {CATALOG_SCHEMA}.lineage"
        ).fetchone()[0]

    def pii_columns(self) -> list[tuple[str, str, str]]:
        """Return [(table_fq, column, tags_csv)] for every PII-tagged column."""
        rows = self.con.execute(
            f"""
            SELECT layer || '.' || table_name, column_name, tags
            FROM {CATALOG_SCHEMA}.columns
            WHERE tags <> ''
            """
        ).fetchall()
        out = []
        for fq, col, tags in rows:
            tagset = {t.strip() for t in tags.split(",") if t.strip()}
            if tagset & PII_TAGS:
                out.append((fq, col, tags))
        return out

    def downstream_of(self, column_fq: str) -> list[str]:
        """BFS forward along the lineage graph; returns all reachable
        downstream columns (column-fq strings)."""
        return self._bfs(column_fq, direction="downstream")

    def upstream_of(self, column_fq: str) -> list[str]:
        """BFS backward along the lineage graph."""
        return self._bfs(column_fq, direction="upstream")

    def _bfs(self, start: str, direction: str) -> list[str]:
        visited: set[str] = set()
        frontier = [start]
        while frontier:
            nxt: list[str] = []
            for node in frontier:
                if node in visited:
                    continue
                visited.add(node)
                if direction == "downstream":
                    rows = self.con.execute(
                        f"SELECT downstream FROM {CATALOG_SCHEMA}.lineage "
                        f"WHERE upstream = ?", [node]
                    ).fetchall()
                else:
                    rows = self.con.execute(
                        f"SELECT upstream FROM {CATALOG_SCHEMA}.lineage "
                        f"WHERE downstream = ?", [node]
                    ).fetchall()
                for (child,) in rows:
                    if child not in visited:
                        nxt.append(child)
            frontier = nxt
        visited.discard(start)
        return sorted(visited)

    # -- enforcement -----------------------------------------------------

    def apply_masks(self, layer: str, table: str, role: str) -> str:
        """Return a SELECT projection for `layer.table` with masking
        policies applied for the given role.

        Non-PII columns pass through unchanged. The role argument is
        reserved for future, finer-grained policies (e.g. unmask for
        admin). Today every role sees the same masks — the wiring is
        here so that adding a per-role override is a one-line change.
        """
        cols = self.con.execute(
            f"""
            SELECT column_name, tags FROM {CATALOG_SCHEMA}.columns
            WHERE layer = ? AND table_name = ?
            ORDER BY column_name
            """,
            [layer, table],
        ).fetchall()
        # masking_policies.column_fq is the full "layer.table.column" key.
        prefix = f"{layer}.{table}."
        pol_rows = self.con.execute(
            f"""
            SELECT column_fq, policy, params_json
            FROM {CATALOG_SCHEMA}.masking_policies
            WHERE column_fq LIKE ?
            """,
            [prefix + "%"],
        ).fetchall()
        policies = {
            fq.removeprefix(prefix): (pol, json.loads(params))
            for fq, pol, params in pol_rows
        }

        proj: list[str] = []
        for col, tags_csv in cols:
            tagset = {t.strip() for t in tags_csv.split(",") if t.strip()}
            if col in policies:
                pol, params = policies[col]
                proj.append(self._render_mask(col, pol, params))
            elif tagset & PII_TAGS:
                # default mask for PII columns without an explicit policy
                proj.append(self._render_mask(col, "partial_mask", {"keep": 2}))
            else:
                proj.append(f'"{col}"')
        return ", ".join(proj)

    @staticmethod
    def _render_mask(col: str, policy: str, params: dict) -> str:
        """Return a SQL expression that produces the masked value of `col`."""
        if policy == "none":
            return f'"{col}"'
        if policy == "redact":
            return f"CAST(NULL AS VARCHAR) AS \"{col}\""
        if policy == "hash":
            return f"md5(CAST(\"{col}\" AS VARCHAR)) AS \"{col}\""
        if policy == "partial_mask":
            keep = int(params.get("keep", 2))
            # Keep the first `keep` chars, mask the rest with '*'.
            return (
                f"CONCAT("
                f"SUBSTR(CAST(\"{col}\" AS VARCHAR), 1, {keep}), "
                f"REPEAT('*', "
                f"GREATEST(LENGTH(CAST(\"{col}\" AS VARCHAR)) - {keep}, 0))"
                f") AS \"{col}\""
            )
        raise ValueError(f"unknown masking policy: {policy}")

    def apply_row_filter(self, layer: str, table: str, role: str) -> str:
        """Return the WHERE-clause fragment that enforces row-level
        security for the given role against `layer.table`. Empty string
        means 'no restriction'."""
        rows = self.con.execute(
            f"SELECT predicate FROM {CATALOG_SCHEMA}.row_policies "
            f"WHERE role = ? AND table_fq = ?",
            [role, f"{layer}.{table}"],
        ).fetchall()
        if not rows:
            return ""
        return " AND ".join(r[0] for r in rows)


# ---------------------------------------------------------------------------
# Demo dataset
# ---------------------------------------------------------------------------


def _builtin_tables() -> list[TableDef]:
    """The reference layered warehouse we catalog."""
    return [
        TableDef(
            layer="ods", name="users",
            description="Original users from source CRM.",
            owner="crm-team",
            columns=(
                ColumnDef("user_id",   "BIGINT",    nullable=False, tags=("id",)),
                ColumnDef("user_name", "VARCHAR",   description="Login handle."),
                ColumnDef("email",     "VARCHAR",   description="Primary email.",
                          tags=("pii", "email")),
                ColumnDef("phone",     "VARCHAR",   description="Mobile number.",
                          tags=("pii", "phone")),
                ColumnDef("register_date", "DATE"),
                ColumnDef("level",     "VARCHAR"),
            ),
        ),
        TableDef(
            layer="ods", name="orders",
            description="Raw orders feed.",
            owner="orders-team",
            columns=(
                ColumnDef("order_id",   "BIGINT",  nullable=False, tags=("id",)),
                ColumnDef("user_id",    "BIGINT",  nullable=False, tags=("fk",)),
                ColumnDef("total",      "DECIMAL(18,2)"),
                ColumnDef("status",     "VARCHAR"),
                ColumnDef("order_date", "DATE"),
                ColumnDef("order_ts",   "TIMESTAMP"),
            ),
        ),
        TableDef(
            layer="dwd", name="orders",
            description="Conformed + deduplicated orders.",
            owner="dwh-team",
            columns=(
                ColumnDef("order_id", "BIGINT", nullable=False),
                ColumnDef("user_id",  "BIGINT", nullable=False),
                ColumnDef("total",    "DECIMAL(18,2)"),
                ColumnDef("status",   "VARCHAR"),
                ColumnDef("dt",       "DATE"),
                ColumnDef("order_ts", "TIMESTAMP"),
            ),
        ),
        TableDef(
            layer="dws", name="user_order_1d",
            description="Per-user-per-day rollup.",
            owner="dwh-team",
            columns=(
                ColumnDef("user_id",      "BIGINT", nullable=False),
                ColumnDef("dt",           "DATE"),
                ColumnDef("order_count",  "BIGINT"),
                ColumnDef("order_amount", "DECIMAL(18,2)"),
                ColumnDef("gmv",          "DECIMAL(18,2)"),
            ),
        ),
        TableDef(
            layer="ads", name="user_rfm",
            description="RFM scoring for marketing.",
            owner="growth-team",
            columns=(
                ColumnDef("user_id",      "BIGINT", nullable=False),
                ColumnDef("recency_days", "INTEGER"),
                ColumnDef("frequency",    "BIGINT"),
                ColumnDef("monetary",     "DECIMAL(18,2)"),
            ),
        ),
    ]


def _builtin_lineage() -> list[LineageEdge]:
    return [
        # ODS -> DWD
        LineageEdge("ods.orders.order_id",   "dwd.orders.order_id",   "pass-through"),
        LineageEdge("ods.orders.user_id",    "dwd.orders.user_id",    "pass-through"),
        LineageEdge("ods.orders.total",      "dwd.orders.total",      "cast DECIMAL(18,2)"),
        LineageEdge("ods.orders.status",     "dwd.orders.status",     "case normalisation"),
        LineageEdge("ods.orders.order_date", "dwd.orders.dt",         "cast DATE"),
        LineageEdge("ods.orders.order_ts",   "dwd.orders.order_ts",   "pass-through"),
        # DWD -> DWS
        LineageEdge("dwd.orders.user_id",    "dws.user_order_1d.user_id",      "group-by key"),
        LineageEdge("dwd.orders.dt",         "dws.user_order_1d.dt",           "group-by key"),
        LineageEdge("dwd.orders.order_id",   "dws.user_order_1d.order_count",  "COUNT(*)"),
        LineageEdge("dwd.orders.total",      "dws.user_order_1d.order_amount", "SUM(total)"),
        LineageEdge("dwd.orders.total",      "dws.user_order_1d.gmv",          "SUM(total) WHERE status='completed'"),
        # DWS -> ADS
        LineageEdge("dws.user_order_1d.user_id",      "ads.user_rfm.user_id",      "join key"),
        LineageEdge("dwd.orders.user_id",             "ads.user_rfm.user_id",      "join key (recency)"),
        LineageEdge("dwd.orders.dt",                  "ads.user_rfm.recency_days", "MAX(dt) - snapshot_dt"),
        LineageEdge("dws.user_order_1d.order_count",  "ads.user_rfm.frequency",    "COUNT(DISTINCT order_id)"),
        LineageEdge("dws.user_order_1d.gmv",          "ads.user_rfm.monetary",     "SUM(gmv)"),
    ]


def _builtin_masks() -> list[MaskPolicy]:
    return [
        # email: hash so cross-table joins still work, but raw value is gone
        MaskPolicy("ods.users.email",  "hash", {}),
        # phone: keep last 2 chars of the original (consumer-facing ops)
        MaskPolicy("ods.users.phone",  "partial_mask", {"keep": 2}),
    ]


def _builtin_row_policies() -> list[RowPolicy]:
    return [
        # Analysts see everything except refunded / cancelled orders.
        RowPolicy("analyst", "dwd.orders",
                  "status NOT IN ('refunded','cancelled')"),
        # Support reps are scoped to orders created in the last 30 days
        # — for this demo we approximate with a date column predicate.
        RowPolicy("support", "dwd.orders",
                  "dt >= (CURRENT_DATE - INTERVAL '30 days')"),
        # Admin role has no policy (no row inserted).
    ]


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def build_demo_catalog(con: duckdb.DuckDBPyConnection) -> MetadataCatalog:
    """Build a fully-populated catalog from the builtin dataset."""
    cat = MetadataCatalog(con)
    for t in _builtin_tables():
        cat.register_table(t)
    cat.add_lineage_batch(_builtin_lineage())
    for p in _builtin_masks():
        cat.add_mask_policy(p)
    for p in _builtin_row_policies():
        cat.add_row_policy(p)
    cat.audit("system", "bootstrap", "catalog",
              f"tables={cat.table_count()} cols={cat.column_count()}")
    return cat


def _print_summary(cat: MetadataCatalog) -> None:
    print("=" * 70)
    print("Metadata Catalog — summary")
    print("=" * 70)
    print(f"tables registered : {cat.table_count()}")
    print(f"columns registered: {cat.column_count()}")
    print(f"lineage edges     : {cat.lineage_count()}")
    pii = cat.pii_columns()
    print(f"PII columns       : {len(pii)}")
    for fq, col, tags in pii:
        print(f"  - {fq}.{col}  tags={tags}")

    # lineage example: blast radius of `ods.users.email`
    blast = cat.downstream_of("ods.users.email")
    print(f"\nDownstream of ods.users.email (blast radius):")
    if blast:
        for col in blast:
            print(f"  - {col}")
    else:
        print("  (none — this column is not yet wired downstream)")

    print("\nRole policies for dwd.orders:")
    for role in DEFAULT_ROLES:
        pred = cat.apply_row_filter("dwd", "orders", role)
        print(f"  - {role:8s} -> {pred or '(no restriction)'}")

    print("\nAudit log tail:")
    rows = cat.con.execute(
        f"SELECT ts, actor, action, target FROM metadata.audit_log "
        f"ORDER BY ts DESC LIMIT 5"
    ).fetchall()
    for ts, actor, action, target in rows:
        print(f"  - {ts}  {actor:10s} {action:12s} {target}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", default=":memory:", help="DuckDB path (default :memory:)")
    args = p.parse_args(argv)
    con = duckdb.connect(args.db)
    try:
        cat = build_demo_catalog(con)
        # exercise a couple of mask/filter operations on real columns
        proj = cat.apply_masks("ods", "users", role="analyst")
        print("\nMasked SELECT for ods.users:")
        print(f"  SELECT {proj} FROM ods.users")
        cat.audit("alice", "preview", "ods.users", "applied masks")

        # lineage example
        downstream = cat.downstream_of("dwd.orders.total")
        print(f"\nLineage: dwd.orders.total -> {len(downstream)} downstream cols")
        for c in downstream:
            print(f"  - {c}")

        _print_summary(cat)
        return 0
    finally:
        con.close()


if __name__ == "__main__":
    sys.exit(main())
