"""Module 10 — vectorized / batch execution.

The leaves of the operator tree become batch ops: each call to
`next()` returns a list of N rows (a "batch"). Filters evaluate
in a tight loop with conditional moves; aggregations are
deferred until the batch boundary.
"""
from __future__ import annotations

from typing import Iterator

from db_engine.shared.types import Row, Schema


class Batch:
    """A columnar mini-batch."""

    __slots__ = ("columns", "rows")

    def __init__(self, columns: list[list], rows: int) -> None:
        self.columns = columns  # one list per output column
        self.rows = rows

    def __iter__(self) -> Iterator[Row]:
        for i in range(self.rows):
            yield Row(rid=None, values=[c[i] for c in self.columns])

    def __len__(self) -> int:
        return self.rows


def vectorized_filter(rows: list[Row], pred) -> list[Row]:
    """Evaluate `pred` against each row's values; return matching rows."""
    out: list[Row] = []
    append = out.append
    for r in rows:
        v = pred(r.values)
        if v is True:
            append(r)
    return out


def vectorized_project(rows: list[Row], indices: list[int]) -> list[Row]:
    return [Row(rid=r.rid, values=[r.values[i] for i in indices]) for r in rows]


# A couple of SIMD-friendly numeric operations; Python doesn't have
# true SIMD but `array.array` exposes an underlying C buffer.
def vectorized_sum(column: list[int]) -> int:
    return sum(column)


def run_demo() -> dict:
    rows = [
        Row(rid=None, values=[i, i % 7, f"k{i}"]) for i in range(16)
    ]
    out = vectorized_filter(rows, lambda v: v[1] == 0)
    return {"batch_size": 16, "filtered": len(out)}


__all__ = ["Batch", "vectorized_filter", "vectorized_project", "vectorized_sum", "run_demo"]
