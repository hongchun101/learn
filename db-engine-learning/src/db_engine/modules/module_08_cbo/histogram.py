"""Equal-height histograms.

A 1-D equal-height histogram on a column with N values and B buckets
puts roughly N/B values in each bucket. Selectivity estimates for
`col < x` use linear interpolation inside the bucket.
"""
from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass, field


@dataclass(slots=True)
class Bucket:
    lo: int | float
    hi: int | float
    count: int


@dataclass(slots=True)
class EqualHeightHistogram:
    column: str
    buckets: list[Bucket] = field(default_factory=list)

    @classmethod
    def build(cls, column: str, values: list[int | float], n_buckets: int = 16) -> "EqualHeightHistogram":
        if not values:
            return cls(column, [])
        values = sorted(values)
        n = len(values)
        size = max(1, n // n_buckets)
        buckets: list[Bucket] = []
        for b in range(n_buckets):
            lo_idx = b * size
            hi_idx = (b + 1) * size - 1 if b < n_buckets - 1 else n - 1
            if lo_idx >= n:
                break
            lo = values[lo_idx]
            hi = values[hi_idx]
            buckets.append(Bucket(lo=lo, hi=hi, count=(hi_idx - lo_idx) + 1))
        return cls(column, buckets)

    def estimate_lt(self, x: int | float, total: int) -> int:
        if not self.buckets:
            return 0
        # Find the bucket where hi ≥ x.
        boundaries = [b.hi for b in self.buckets]
        b_idx = bisect_right(boundaries, x) - 1
        if b_idx < 0:
            return 0
        b = self.buckets[b_idx]
        if b.hi == b.lo:
            return total * sum(bb.count for bb in self.buckets[:b_idx]) // max(1, sum(bb.count for bb in self.buckets))
        frac = (x - b.lo) / (b.hi - b.lo)
        frac = max(0.0, min(1.0, frac))
        before = sum(bb.count for bb in self.buckets[:b_idx])
        return total * (before + int(frac * b.count)) // max(1, sum(bb.count for bb in self.buckets))


__all__ = ["EqualHeightHistogram"]
