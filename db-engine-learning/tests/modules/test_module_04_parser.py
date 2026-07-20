"""Module 04 — tests."""
from __future__ import annotations

from db_engine.modules.module_04_parser.ast_nodes import (
    CreateTable,
    ExprKind,
    Insert,
    Select,
)
from db_engine.modules.module_04_parser.parser import SqlParser


def test_select_parses():
    ast = SqlParser("SELECT a, b FROM t WHERE x > 1;").parse()
    sel = ast.stmt
    assert isinstance(sel, Select)
    assert len(sel.columns) == 2
    assert sel.from_.table == "t"
    assert sel.where is not None
    assert sel.where.kind == ExprKind.COMPARE
    assert sel.where.op == ">"


def test_insert_parses():
    ast = SqlParser("INSERT INTO t (a, b) VALUES (1, 'x'), (2, 'y');").parse()
    ins = ast.stmt
    assert isinstance(ins, Insert)
    assert ins.table == "t"
    assert ins.columns == ("a", "b")
    assert len(ins.values) == 2


def test_create_table_parses():
    ast = SqlParser("CREATE TABLE t (id INT, name TEXT);").parse()
    ct = ast.stmt
    assert isinstance(ct, CreateTable)
    assert ct.name == "t"
    assert ct.columns == (("id", "INT"), ("name", "TEXT"))


def test_group_by_having_order_by_limit():
    ast = SqlParser("SELECT a FROM t GROUP BY a HAVING a > 1 ORDER BY a DESC LIMIT 5;").parse()
    sel = ast.stmt
    assert len(sel.group_by) == 1
    assert sel.having is not None
    assert sel.order_by and sel.order_by[0][1] is False  # DESC
    assert sel.limit == 5


def test_chapter_demo_runs():
    from db_engine.modules.module_04_parser.chapter import run_demo
    out = run_demo()
    assert out["columns"][0][0] == "COLUMN"
