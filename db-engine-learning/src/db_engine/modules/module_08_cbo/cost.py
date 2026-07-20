"""A tiny cost model.

Cost is just an estimate of work (CPU + I/O). The CBO picks the
plan with the lowest estimated cost. Production engines model
distinct costs: seq scan vs index lookup vs hash probe.

For the curriculum, a single scalar per row plus a constant per
operator is enough to drive a join-ordering DP.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class CostModel:
    seq_scan_per_page: int = 1
    index_lookup: int = 4
    hash_join_build: int = 2
    hash_join_probe: int = 1
    nl_join_per_combo: int = 5
    cpu_per_row: int = 1

    def scan(self, rows: int, pages: int) -> int:
        return pages * self.seq_scan_per_page + rows * self.cpu_per_row

    def nl(self, outer: int, inner: int) -> int:
        return outer * inner * self.nl_join_per_combo

    def hash_join(self, build: int, probe: int) -> int:
        return build * self.hash_join_build + probe * self.hash_join_probe


def estimate_rows_for_eq(col_distinct: int, total: int) -> int:
    """Estimated rows from `col = constant` (uniform assumption)."""
    if col_distinct <= 0:
        return 1
    return max(1, total // col_distinct)


__all__ = ["CostModel", "estimate_rows_for_eq"]
