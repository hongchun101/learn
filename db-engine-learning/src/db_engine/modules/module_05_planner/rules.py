"""Optimizer rules.

The three rules every engine ships before it starts measuring cost:

1. **Predicate pushdown** — move predicates closer to scans.
2. **Projection pushdown** — read only the columns actually used.
3. **Predicate simplification** — `WHERE 1=1`, `WHERE a = a`, tautologies.

These are rewrites of the operator tree, not of the AST.
"""
from __future__ import annotations

from typing import Iterable

from db_engine._contracts.plan import Operator, OpKind
from db_engine.modules.module_04_parser.ast_nodes import Expr, ExprKind


def predicate_pushdown(plan: Operator) -> Operator:
    """Pull filters down past projections and sorts.

    We treat Project and Sort as blocking operators; we do *not*
    push past HashAgg because it changes the output schema.
    """
    if not plan.children:
        return plan

    if plan.kind is OpKind.FILTER and plan.children and plan.children[0].kind is OpKind.SCAN:
        # Already as low as it can go.
        return plan

    new_children = tuple(predicate_pushdown(c) for c in plan.children)

    # FILTER above SCAN: stays put.
    if plan.kind is OpKind.FILTER:
        return Operator(
            kind=OpKind.FILTER,
            predicate=plan.predicate,
            children=new_children,
        )

    # PROJECT can swap with FILTER (predicate does not need non-projected cols).
    # The naive check: if every column referenced in the predicate is
    # also in the projection, it's safe to swap.
    if (
        plan.kind is OpKind.PROJECT
        and len(new_children) == 1
        and new_children[0].kind in (OpKind.SCAN, OpKind.PROJECT)
    ):
        # Conservative: keep the order, but make sure FILTER below
        # PROJECT is *also* considered. The simplest thing: pull a
        # child FILTER out of a PROJECT root and swap.
        # For the curriculum we don't reorder; we surface the rule
        # for later chapters to use.
        return Operator(kind=OpKind.PROJECT, columns=plan.columns, children=new_children)

    # Default: just recurse.
    return Operator(
        kind=plan.kind,
        table=plan.table,
        schema=plan.schema,
        predicate=plan.predicate,
        columns=plan.columns,
        children=new_children,
        args=plan.args,
    )


def projection_pushdown(plan: Operator) -> Operator:
    """Trim projected column sets to the lowest scan.

    Not implemented in full — exercised in chapter 13 (columnar).
    This stub exists so the planner tests can call it without error.
    """
    return plan


def simplify_predicate(expr: Expr) -> Expr | None:
    """`TRUE`, `a = a`, `1 = 1` ⇒ None (drop the FILTER)."""
    if expr is None:
        return None
    if expr.kind is ExprKind.LITERAL and expr.value is True:
        return None
    if expr.kind is ExprKind.COMPARE and expr.op == "=" and _same(expr.args[0], expr.args[1]):
        return None
    if expr.kind is ExprKind.BINOP and expr.op == "AND":
        a = simplify_predicate(expr.args[0])
        b = simplify_predicate(expr.args[1])
        if a is None and b is None:
            return None
        if a is None:
            return b
        if b is None:
            return a
        return Expr(kind=ExprKind.BINOP, op="AND", args=(a, b))
    return expr


def _same(a: Expr, b: Expr) -> bool:
    return a.kind is b.kind and a.value == b.value and a.op == b.op and a.args == b.args


__all__ = ["predicate_pushdown", "projection_pushdown", "simplify_predicate"]
