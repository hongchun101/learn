"""Covering indexes — index-leaf-only scan.

A covering index contains the columns the query needs in the
leaves; the executor never has to touch the heap. We build a
sorted map keyed on the leading column with the included columns
stored alongside.
"""
from __future__ import annotations

from typing import Any, Iterable

from db_engine.modules.module_06_executor.catalog import Table


class CoveringIndex:
    def __init__(self, table: Table, key_column: str, included: tuple[str, ...]) -> None:
        self.table = table
        self.key_column = key_column
        self.included = included
        self._rows: list[tuple[Any, tuple[Any, ...]]] = []

    def build(self) -> None:
        ki = self.table.schema.index(self.key_column)
        ii = tuple(self.table.schema.index(c) for c in self.included)
        out: list[tuple[Any, tuple[Any, ...]]] = []
        for row in self.table.all_rows():
            v = row.values[ki]
            extras = tuple(row.values[i] for i in ii)
            out.append((v, extras))
        out.sort()
        self._rows = out

    def lookup(self, value: Any) -> Iterable[tuple[Any, tuple[Any, ...]]]:
        for k, extras in self._rows:
            if k == value:
                yield k, extras
            if k > value:
                return


__all__ = ["CoveringIndex"]
