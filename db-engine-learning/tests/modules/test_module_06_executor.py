"""Module 06 — tests."""
from __future__ import annotations

from db_engine._contracts.plan import OpKind
from db_engine.modules.module_04_parser.ast_nodes import ColumnRef, Expr, ExprKind
from db_engine.modules.module_04_parser.parser import SqlParser
from db_engine.modules.module_05_planner.planner import Planner
from db_engine.modules.module_06_executor.catalog import Catalog
from db_engine.modules.module_06_executor.operators import Executor
from db_engine.shared.types import Column, Schema, SqlType


def _catalog():
    cat = Catalog()
    cat.create_table(
        "t",
        Schema((
            Column("id", SqlType.INT),
            Column("name", SqlType.TEXT),
            Column("price", SqlType.INT),
        )),
    )
    return cat


def test_scan_returns_rows():
    cat = _catalog()
    cat.get("t").insert({"id": 1, "name": "alice", "price": 12})
    cat.get("t").insert({"id": 2, "name": "bob", "price": 5})
    plan = Planner(cat.schemas()).optimize(SqlParser("SELECT id FROM t;").parse())
    e = Executor(cat)
    rows = list(e.run(plan))
    assert len(rows) == 2


def test_filter_selects_rows():
    cat = _catalog()
    cat.get("t").insert({"id": 1, "name": "alice", "price": 12})
    cat.get("t").insert({"id": 2, "name": "bob", "price": 5})
    plan = Planner(cat.schemas()).optimize(SqlParser("SELECT id FROM t WHERE price > 10;").parse())
    e = Executor(cat)
    rows = list(e.run(plan))
    assert len(rows) == 1 and rows[0].values[0] == 1


def test_sort_orders_rows():
    cat = _catalog()
    for i, p in enumerate([5, 12, 8, 1, 30]):
        cat.get("t").insert({"id": i, "name": f"n{i}", "price": p})
    plan = Planner(cat.schemas()).optimize(SqlParser("SELECT price FROM t ORDER BY price DESC;").parse())
    e = Executor(cat)
    prices = [r.values[0] for r in e.run(plan)]
    assert prices == [30, 12, 8, 5, 1]


def test_limit_truncates():
    cat = _catalog()
    for i in range(10):
        cat.get("t").insert({"id": i, "name": f"n{i}", "price": i})
    plan = Planner(cat.schemas()).optimize(SqlParser("SELECT id FROM t LIMIT 3;").parse())
    e = Executor(cat)
    rows = list(e.run(plan))
    assert len(rows) == 3


def test_chapter_demo_runs():
    from db_engine.modules.module_06_executor.chapter import run_demo
    out = run_demo()
    assert "rows" in out
