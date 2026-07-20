"""AST → operator tree.

The planner is the simplest interesting piece of the optimizer. It
takes ASTs and produces a tree of `Operator`s that the executor
runs. Chapter 05 is rule-based; chapter 08 adds cost-based
decisions.

Conventions used throughout:
- Operator leaves are scans.
- Operators nest: the root is what the executor opens first.
- `args` carry operator-specific parameters (join keys, agg keys).
"""
from __future__ import annotations

from typing import Any

from db_engine._contracts.plan import Operator, OpKind, Plan
from db_engine.modules.module_04_parser.ast_nodes import (
    Ast,
    CreateTable,
    Expr,
    ExprKind,
    Insert,
    Select,
)
from db_engine.shared.types import Column, Schema, SqlType


class Planner(Plan):
    """AST → operator tree."""

    def __init__(self, catalog: "dict[str, Schema] | None" = None) -> None:
        self.catalog = catalog or {}

    def optimize(self, ast: Ast, stats: Any | None = None) -> Operator:
        stmt = ast.stmt
        if isinstance(stmt, Select):
            return self._plan_select(stmt)
        if isinstance(stmt, Insert):
            return self._plan_insert(stmt)
        if isinstance(stmt, CreateTable):
            return self._plan_create(stmt)
        raise ValueError(f"unknown statement: {type(stmt).__name__}")

    def _plan_select(self, sel: Select) -> Operator:
        schema = self.catalog.get(sel.from_.table)
        scan = Operator(
            kind=OpKind.SCAN,
            table=sel.from_.table,
            schema=schema,
            args={"alias": sel.from_.alias},
        )
        node = scan
        if sel.where is not None:
            node = Operator(
                kind=OpKind.FILTER,
                table=sel.from_.table,
                predicate=sel.where,
                children=(node,),
            )
        if sel.group_by:
            node = Operator(
                kind=OpKind.HASH_AGG,
                children=(node,),
                args={"group_keys": tuple(sel.group_by), "agg_args": tuple(sel.columns)},
            )
        if sel.order_by:
            sort_pairs = tuple(
                (k, asc) for (k, asc) in sel.order_by
            )
            node = Operator(
                kind=OpKind.SORT,
                children=(node,),
                args={"sort_keys": sort_pairs},
            )
        if sel.columns and not (len(sel.columns) == 1 and sel.columns[0].kind is ExprKind.STAR):
            node = Operator(
                kind=OpKind.PROJECT,
                children=(node,),
                args={"columns": tuple(sel.columns)},
            )
        if sel.limit is not None:
            node = Operator(kind=OpKind.LIMIT, children=(node,), args={"limit": sel.limit})
        return node

    def _plan_insert(self, ins: Insert) -> Operator:
        schema = self.catalog.get(ins.table)
        return Operator(
            kind=OpKind.INSERT,
            table=ins.table,
            schema=schema,
            args={"columns": tuple(ins.columns), "values": tuple(ins.values)},
        )

    def _plan_create(self, ct: CreateTable) -> Operator:
        cols: list[Column] = []
        for name, type_text in ct.columns:
            st = SqlType(type_text)
            cols.append(Column(name=name, sql_type=st))
        # The CREATE TABLE op's "name" lives in the table slot; we use
        # the first column name as the table name placeholder.
        if not cols:
            raise ValueError("CREATE TABLE requires at least one column")
        schema = Schema(tuple(cols))
        return Operator(
            kind=OpKind.CREATE_TABLE,
            table=cols[0].name,
            schema=schema,
            args={"table_name": ct.name, "cols": tuple(ct.columns)},
        )


__all__ = ["Planner"]
