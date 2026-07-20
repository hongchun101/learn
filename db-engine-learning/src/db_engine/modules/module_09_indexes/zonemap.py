"""Zone maps — per-block (min, max, count-null) summary.

A zone map enables partition pruning: a query `WHERE col > 100`
can skip blocks whose max is less than 100. The block is a "zone";
real engines pick a zone size based on row width (typically
100 K rows).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class ZoneMap:
    column: str
    zone_id: int
    lo: Any
    hi: Any
    nulls: int
    count: int

    def may_contain(self, lo: Any, hi: Any) -> bool:
        """Is there any row in this zone that might lie in [lo, hi]?"""
        if self.lo is None or self.hi is None:
            return True  # empty zone
        # Disjoint ranges ⇒ may not contain.
        if self.hi < lo or hi < self.lo:
            return False
        return True


class ZoneMapIndex:
    def __init__(self, column: str, zone_size: int = 1024) -> None:
        self.column = column
        self.zone_size = zone_size
        self.zones: list[ZoneMap] = []

    def build_from_rows(self, rows: list[Any]) -> None:
        self.zones = []
        for i in range(0, len(rows), self.zone_size):
            block = rows[i : i + self.zone_size]
            if not block:
                continue
            zone_id = i // self.zone_size
            non_null = [v for v in block if v is not None]
            lo = min(non_null) if non_null else None
            hi = max(non_null) if non_null else None
            nulls = sum(1 for v in block if v is None)
            self.zones.append(ZoneMap(self.column, zone_id, lo, hi, nulls, len(block)))

    def prune(self, lo: Any, hi: Any) -> list[ZoneMap]:
        return [z for z in self.zones if z.may_contain(lo, hi)]


__all__ = ["ZoneMap", "ZoneMapIndex"]
