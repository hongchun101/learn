"""AST nodes used by parser, planner, executor, optimizer.

Kept here (rather than in `_contracts/parser`) for ergonomic import
and so the planner can pattern-match without `TYPE_CHECKING` games.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ExprKind(str, Enum):
    LITERAL = "LITERAL"
    COLUMN = "COLUMN"
    BINOP = "BINOP"
    UNARY = "UNARY"
    COMPARE = "COMPARE"
    STAR = "STAR"


@dataclass(slots=True, frozen=True)
class ColumnRef:
    table: str | None
    name: str


@dataclass(slots=True, frozen=True)
class Expr:
    kind: ExprKind
    value: Any = None
    op: str | None = None
    args: tuple["Expr", ...] = ()


@dataclass(slots=True, frozen=True)
class From:
    table: str
    alias: str | None = None


@dataclass(slots=True, frozen=True)
class Select:
    distinct: bool
    columns: tuple[Expr, ...]
    from_: From
    where: Expr | None
    group_by: tuple[Expr, ...] = ()
    having: Expr | None = None
    order_by: tuple[tuple[Expr, bool], ...] = ()
    limit: int | None = None


@dataclass(slots=True, frozen=True)
class Insert:
    table: str
    columns: tuple[str, ...]
    values: tuple[tuple[Expr, ...], ...]


@dataclass(slots=True, frozen=True)
class CreateTable:
    name: str
    columns: tuple[tuple[str, str], ...]


@dataclass(slots=True, frozen=True)
class Ast:
    stmt: Select | Insert | CreateTable


__all__ = [
    "ExprKind",
    "ColumnRef",
    "Expr",
    "From",
    "Select",
    "Insert",
    "CreateTable",
    "Ast",
]
