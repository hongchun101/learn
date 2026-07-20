"""The Stats contract — Chapter 08 introduces it.

`Stats` provides per-column histograms and table cardinalities for
the cost-based optimizer. The contract is intentionally minimal:
counts and bucketed distributions.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(slots=True)
class Bucket:
    """One histogram bucket."""
    low: int | str
    high: int | str
    count: int
    distinct: int


@dataclass(slots=True)
class Histogram:
    column: str
    total_rows: int
    distinct: int
    nulls: int
    buckets: list[Bucket] = field(default_factory=list)

    def estimate_lt(self, value: int | str) -> int:
        """Rows with column < `value` (estimate)."""
        out = 0
        for b in self.buckets:
            if b.high < value:
                out += b.count
            else:
                # linear interpolation inside the bucket
                if isinstance(value, int) and isinstance(b.high, int) and isinstance(b.low, int):
                    span = max(1, b.high - b.low + 1)
                    position = max(0, min(span, value - b.low))
                    out += (b.count * position) // span
                return out
        return out


class Stats(ABC):
    """Statistics used by the optimizer.

    Contract:
      - `cardinality(table)` returns total row count.
      - `histogram(table, column)` returns an `Histogram` or None.
      - Updates may be batched: small tables scan-and-rebuild; large
        tables sample.
    """

    @abstractmethod
    def cardinality(self, table: str) -> int: ...

    @abstractmethod
    def histogram(self, table: str, column: str) -> Histogram | None: ...

    @abstractmethod
    def refresh(self, table: str) -> None: ...
