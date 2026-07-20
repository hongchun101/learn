"""Secondary indexes on in-memory tables.

A secondary index maps `(column-value) → row-position-in-table`.
Lookups are O(log N) if backed by a sorted dict; we sort once at
build time and look up by binary search.
"""
from __future__ import annotations

from bisect import bisect_left, bisect_right
from typing import Any, Iterable

from db_engine.modules.module_06_executor.catalog import Table


class SecondaryIndex:
    def __init__(self, table: Table, column: str) -> None:
        self.table = table
        self.column = column
        self._build()

    def _build(self) -> None:
        pos_col = self.table.schema.index(self.column)
        self._pos_col = pos_col
        # (value, row_idx)
        pairs = [(r.values[pos_col], i) for i, r in enumerate(self.table.all_rows())]
        pairs.sort()
        self._values = [p[0] for p in pairs]
        self._positions = [p[1] for p in pairs]

    def lookup(self, value: Any) -> Iterable[int]:
        lo = bisect_left(self._values, value)
        hi = bisect_right(self._values, value)
        for i in range(lo, hi):
            yield self._positions[i]

    def range_scan(self, lo: Any, hi: Any) -> Iterable[int]:
        lo_i = bisect_left(self._values, lo)
        hi_i = bisect_right(self._values, hi)
        for i in range(lo_i, hi_i):
            yield self._positions[i]


__all__ = ["SecondaryIndex"]
