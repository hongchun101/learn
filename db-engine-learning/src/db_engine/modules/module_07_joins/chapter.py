"""Module 07 — chapter + run_demo()."""
from __future__ import annotations

import json

from db_engine._contracts.plan import OpKind, Operator
from db_engine.modules.module_06_executor.catalog import Catalog
from db_engine.modules.module_06_executor.operators import Executor
from db_engine.modules.module_07_joins.operators import (
    _evaluate_on,
)
from db_engine.modules.module_04_parser.ast_nodes import Expr, ExprKind
from db_engine.shared.types import Column, Schema, SqlType


def make_catalog() -> Catalog:
    cat = Catalog()
    cat.create_table(
        "orders",
        Schema((
            Column("oid", SqlType.INT),
            Column("cid", SqlType.INT),
            Column("price", SqlType.INT),
        )),
    )
    o = cat.get("orders")
    for cid, price in [(1, 10), (2, 20), (2, 5), (3, 8)]:
        o.insert({"oid": 999, "cid": cid, "price": price})
    cat.create_table(
        "customers",
        Schema((
            Column("cid", SqlType.INT),
            Column("name", SqlType.TEXT),
        )),
    )
    c = cat.get("customers")
    for cid, name in [(1, "alice"), (2, "bob"), (3, "carol")]:
        c.insert({"cid": cid, "name": name})
    return cat


def _join_plan(join_kind: OpKind) -> Operator:
    eq = Expr(
        kind=ExprKind.COMPARE,
        op="=",
        args=(
            Expr(kind=ExprKind.COLUMN, value=_table_col("orders", "cid")),
            Expr(kind=ExprKind.COLUMN, value=_table_col("customers", "cid")),
        ),
    )
    return Operator(
        kind=join_kind,
        predicate=eq,
        children=(
            Operator(kind=OpKind.SCAN, table="orders"),
            Operator(kind=OpKind.SCAN, table="customers"),
        ),
        args={"keys": [Expr(kind=ExprKind.COLUMN, value=_table_col("orders", "cid"))],
              "probe_keys": [Expr(kind=ExprKind.COLUMN, value=_table_col("customers", "cid"))],
              "right_keys": [Expr(kind=ExprKind.COLUMN, value=_table_col("customers", "cid"))]},
    )


def _table_col(table: str, name: str):
    from db_engine.modules.module_04_parser.ast_nodes import ColumnRef
    return ColumnRef(table=table, name=name)


def run_demo() -> dict:
    cat = make_catalog()
    out = {}
    for kind in (OpKind.NL_JOIN, OpKind.HASH_JOIN, OpKind.SORT_MERGE_JOIN):
        plan = _join_plan(kind)
        e = Executor(cat)
        rows = [r.values for r in e.run(plan)]
        out[kind.name] = rows
    return out


if __name__ == "__main__":
    print(json.dumps(run_demo(), indent=2, default=str))
