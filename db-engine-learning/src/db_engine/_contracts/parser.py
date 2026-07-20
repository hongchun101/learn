"""The Parser contract — Chapter 04 introduces it.

A `Parser` accepts a SQL string and emits an AST. The AST nodes are
typed dataclasses; the executor never inspects a string after parsing.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# AST nodes
# ---------------------------------------------------------------------------

class ExprKind(str, Enum):
    LITERAL = "LITERAL"
    COLUMN = "COLUMN"
    BINOP = "BINOP"
    UNARY = "UNARY"
    COMPARE = "COMPARE"


@dataclass(slots=True, frozen=True)
class Expr:
    """A boolean or value expression node."""
    kind: ExprKind
    value: Any = None
    op: str | None = None
    args: tuple["Expr", ...] = ()


@dataclass(slots=True, frozen=True)
class ColumnRef:
    """An optional table-qualified column reference."""
    table: str | None
    name: str


@dataclass(slots=True, frozen=True)
class From:
    """A from-clause: a single table, optionally aliased."""
    table: str
    alias: str | None = None


@dataclass(slots=True, frozen=True)
class Select:
    """A SELECT statement."""
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
    columns: tuple[tuple[str, str], ...]  # (name, sql_type)


@dataclass(slots=True, frozen=True)
class Ast:
    """A parsed statement."""
    stmt: Select | Insert | CreateTable


# ---------------------------------------------------------------------------
# Parser contract
# ---------------------------------------------------------------------------

class Parser(ABC):
    """SQL → AST.

    Contract:
      - `parse(sql)` accepts a single SQL statement terminated by `;`.
      - Returns an `Ast` with one of: Select, Insert, CreateTable.
      - On syntax error raises `EngineError`.
    """

    @abstractmethod
    def parse(self, sql: str) -> Ast: ...
