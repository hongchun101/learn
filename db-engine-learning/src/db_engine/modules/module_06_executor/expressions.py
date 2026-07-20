"""Evaluating AST expressions against a row of values.

The `eval_expr` function takes:
- an Expr (AST)
- a list of column values
- a schema for resolving column refs

Returns the value for that row. Three-valued logic: NULLs propagate.
"""
from __future__ import annotations

from typing import Any

from db_engine.modules.module_04_parser.ast_nodes import Expr, ExprKind
from db_engine.shared.types import Schema


def eval_expr(expr: Expr, row: list | None, schema: Schema | None = None) -> Any:
    if row is not None and expr.kind is ExprKind.COLUMN and expr.value is not None:
        if schema is None:
            raise ValueError("schema required to evaluate column expr")
        # Resolve column.
        idx = schema.index(expr.value.name)
        return row[idx]
    if expr.kind is ExprKind.LITERAL:
        return expr.value
    if expr.kind is ExprKind.UNARY and expr.op == "NOT":
        v = eval_expr(expr.args[0], row, schema)
        if v is None:
            return None
        return not v
    if expr.kind is ExprKind.BINOP and expr.op == "AND":
        l = eval_expr(expr.args[0], row, schema)
        # SQL three-valued logic: NULL AND TRUE = NULL; NULL AND FALSE = FALSE.
        r = eval_expr(expr.args[1], row, schema)
        if l is False or r is False:
            return False
        if l is None or r is None:
            return None
        return True
    if expr.kind is ExprKind.BINOP and expr.op == "OR":
        l = eval_expr(expr.args[0], row, schema)
        r = eval_expr(expr.args[1], row, schema)
        if l is True or r is True:
            return True
        if l is None or r is None:
            return None
        return False
    if expr.kind is ExprKind.COMPARE:
        return _compare(expr, row, schema)
    raise ValueError(f"unsupported expr kind {expr.kind}")


def _compare(expr: Expr, row: list, schema: Schema | None) -> Any:
    if len(expr.args) != 2:
        raise ValueError("compare expects two args")
    left = eval_expr(expr.args[0], row, schema)
    right = eval_expr(expr.args[1], row, schema)
    if left is None or right is None:
        return None
    op = expr.op
    if op == "=":
        return left == right
    if op == "<":
        return left < right
    if op == ">":
        return left > right
    if op == "<=":
        return left <= right
    if op == ">=":
        return left >= right
    if op in ("!=", "<>"):
        return left != right
    raise ValueError(f"unsupported op {op}")


__all__ = ["eval_expr"]
