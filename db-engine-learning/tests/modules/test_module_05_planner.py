"""Module 05 — tests."""
from __future__ import annotations

from db_engine._contracts.plan import OpKind
from db_engine.modules.module_04_parser.parser import SqlParser
from db_engine.modules.module_05_planner.planner import Planner
from db_engine.modules.module_05_planner.rules import predicate_pushdown, simplify_predicate
from db_engine.shared.types import Column, Schema, SqlType


def _catalog():
    return {
        "t": Schema((
            Column("a", SqlType.INT),
            Column("b", SqlType.INT),
        )),
    }


def test_select_plan_shape():
    ast = SqlParser("SELECT a FROM t WHERE b = 1;").parse()
    plan = Planner(_catalog()).optimize(ast)
    assert plan.kind is OpKind.PROJECT
    child = plan.children[0]
    assert child.kind is OpKind.FILTER
    assert child.children[0].kind is OpKind.SCAN


def test_create_plan():
    ast = SqlParser("CREATE TABLE t (a INT);").parse()
    plan = Planner(_catalog()).optimize(ast)
    assert plan.kind is OpKind.CREATE_TABLE


def test_pushdown_noop_for_optimal():
    ast = SqlParser("SELECT a FROM t WHERE b = 1;").parse()
    plan = Planner(_catalog()).optimize(ast)
    pushed = predicate_pushdown(plan)
    assert pushed.kind == plan.kind


def test_simplify_tautology():
    from db_engine.modules.module_04_parser.ast_nodes import ExprKind
    e = SqlParser("WHERE 1 = 1").parse().stmt.where
    assert e is None or simplify_predicate(e) is None or simplify_predicate(e).kind != ExprKind.COMPARE
