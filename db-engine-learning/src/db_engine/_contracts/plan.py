"""The Plan / Operator contract — Chapter 05 introduces it.

An `Operator` is a node in the physical plan tree; a `Plan` produces
a tree from an AST. The executor takes the tree and runs it.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from db_engine._contracts.parser import Ast, Expr
from db_engine.shared.types import Schema


class OpKind(str, Enum):
    SCAN = "SCAN"
    FILTER = "FILTER"
    PROJECT = "PROJECT"
    HASH_JOIN = "HASH_JOIN"
    NL_JOIN = "NL_JOIN"
    SORT_MERGE_JOIN = "SORT_MERGE_JOIN"
    HASH_AGG = "HASH_AGG"
    SORT = "SORT"
    LIMIT = "LIMIT"
    EXCHANGE = "EXCHANGE"
    INSERT = "INSERT"
    CREATE_TABLE = "CREATE_TABLE"


@dataclass(slots=True, frozen=True)
class Operator:
    """One node in the physical plan."""
    kind: OpKind
    table: str | None = None
    schema: Schema | None = None
    predicate: Expr | None = None
    columns: tuple[int, ...] | None = None
    children: tuple["Operator", ...] = ()
    args: dict[str, Any] = field(default_factory=dict)


class Plan(ABC):
    """AST → operator tree.

    Contract:
      - `optimize(ast, stats)` returns a tree whose leaves are scans
        and whose root is whatever the query needs (a Scan for a
        pure-filter, a Project for a SELECT *, etc.).
      - The tree must be deterministic given the same inputs.
    """

    @abstractmethod
    def optimize(self, ast: Ast, stats: Any | None = None) -> Operator: ...
