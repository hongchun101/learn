"""Module 14 — OLAP queries, sketches.

What's inside:
- `groupby.py` — runtime group-by aggregation over a columnar batch.
- `topk.py` — exact + approximate top-k via frequency tables.
- `hll.py` — HyperLogLog: approximate distinct count.
- `tdigest.py` — t-digest: mergeable quantile sketch.
"""
from __future__ import annotations

import math
import random
from collections import Counter
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Group-by aggregation
# ---------------------------------------------------------------------------

def groupby_aggregate(values: list, group_keys: list, aggs: dict) -> dict[tuple, dict]:
    """Group by `group_keys[i]`; for each group compute agg(name) ∈ aggs.

    `aggs = {"count": None, "sum_x": ("sum", "x")}`.
    """
    out: dict[tuple, dict] = {}
    for i in range(len(values)):
        # Placeholder; in production we'd batch.
        pass
    # The "values" of the column under aggregation are paired.
    cols = group_keys if isinstance(group_keys, list) and group_keys and isinstance(group_keys[0], list) else [group_keys]
    group_cols = cols
    agg_cols = aggs
    # Lightweight implementation: only works for one group key + one sum.
    return _gb_one(values, group_cols, agg_cols)


def _gb_one(values: dict[str, list], group_cols: list[str], agg_cols: dict) -> dict:
    group_col = group_cols[0]
    keys = values[group_col]
    out: dict = {}
    for i, k in enumerate(keys):
        bucket = out.setdefault(k, {})
        for agg_name, fn in agg_cols.items():
            if fn is None:
                bucket[agg_name] = bucket.get(agg_name, 0) + 1
            else:
                kind, col = fn
                v = values[col][i]
                if kind == "sum":
                    bucket[agg_name] = bucket.get(agg_name, 0) + v
                elif kind == "min":
                    if "min" not in bucket:
                        bucket["min"] = v
                    bucket["min"] = min(bucket["min"], v)
                elif kind == "max":
                    if "max" not in bucket:
                        bucket["max"] = v
                    bucket["max"] = max(bucket["max"], v)
                elif kind == "avg":
                    bucket.setdefault("_sum", 0)
                    bucket["_sum"] += v
                    bucket["_n"] = bucket.get("_n", 0) + 1
                    bucket["avg"] = bucket["_sum"] / bucket["_n"]
    return out


# ---------------------------------------------------------------------------
# Top-k
# ---------------------------------------------------------------------------

def topk(values: list, k: int) -> list[tuple]:
    counter = Counter(values)
    return counter.most_common(k)


def topk_approx(values: list, k: int, sample: int = 100) -> list[tuple]:
    """Approximate top-k via uniform sampling."""
    sample_size = min(len(values), sample)
    sample = random.sample(values, sample_size) if sample_size < len(values) else list(values)
    return topk(sample, k)


# ---------------------------------------------------------------------------
# HLL
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class HyperLogLog:
    p: int = 12  # 4096 buckets
    registers: list[int] = field(default_factory=lambda: [0] * (1 << 12))

    def add(self, item: int | str | bytes) -> None:
        if isinstance(item, str):
            item = item.encode()
        elif isinstance(item, int):
            item = str(item).encode()
        # xxHash-style: use Python's built-in `hash` is stable across runs only sometimes.
        h = int.from_bytes(__hash(item), "big")
        idx = h >> (64 - self.p)
        w = h << self.p
        # Count trailing zeros + 1.
        rho = 1
        for i in range(64 - self.p):
            if not (w >> (63 - i)) & 1:
                rho += 1
            else:
                break
        if self.registers[idx] < rho:
            self.registers[idx] = rho

    def count(self) -> int:
        m = 1 << self.p
        alpha = 0.7213 / (1 + 1.079 / m)
        indicator = sum(2.0 ** -r for r in self.registers)
        raw = alpha * m * m / indicator
        # Small-range correction.
        if raw <= 2.5 * m:
            zeros = self.registers.count(0)
            if zeros > 0:
                return int(m * math.log(m / zeros))
        return int(raw)


def __hash(b: bytes) -> bytes:
    """Tiny 64-bit FNV-style hash; deterministic across runs."""
    h = 0xCBF29CE484222325
    for x in b:
        h = ((h ^ x) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return h.to_bytes(8, "big")


# ---------------------------------------------------------------------------
# t-digest
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class _Centroid:
    mean: float
    weight: int

    def add(self, x: float, w: int) -> "_Centroid":
        self.mean = (self.mean * self.weight + x * w) / (self.weight + w)
        self.weight += w
        return self


class TDigest:
    def __init__(self, max_centroids: int = 100) -> None:
        self._centroids: list[_Centroid] = []
        self._max = max_centroids

    def add(self, x: float) -> None:
        if not self._centroids:
            self._centroids.append(_Centroid(x, 1))
            return
        # Naive merge: append then merge nearest two.
        self._centroids.append(_Centroid(x, 1))
        if len(self._centroids) > self._max:
            # Merge closest two.
            best = (1, self._centroids[0].mean)
            for i in range(1, len(self._centroids)):
                d = abs(self._centroids[i].mean - self._centroids[i - 1].mean)
                if d < best[0]:
                    best = (d, i)
            j = best[1]
            self._centroids[j - 1].add(self._centroids[j].mean, self._centroids[j].weight)
            del self._centroids[j]

    def quantile(self, q: float) -> float:
        if not self._centroids:
            return 0.0
        # Sort by mean.
        self._centroids.sort(key=lambda c: c.mean)
        total = sum(c.weight for c in self._centroids)
        acc = 0
        for c in self._centroids:
            if acc + c.weight >= q * total:
                return c.mean
            acc += c.weight
        return self._centroids[-1].mean


def run_demo() -> dict:
    rng = list(range(100))
    out_groupby = _gb_one({"k": [1, 1, 2, 2, 2, 3], "v": [10, 20, 5, 15, 25, 1]},
                          ["k"], {"count": None, "sum_v": ("sum", "v")})

    top3 = topk([1, 1, 2, 2, 2, 3, 3, 3, 3, 4], 3)

    hll = HyperLogLog(p=4)  # tiny for demo
    for v in range(10_000):
        hll.add(v)

    td = TDigest()
    for v in range(1000):
        td.add(v + 0.5)

    return {
        "groupby": out_groupby,
        "top3": top3,
        "hll_distinct_estimate": hll.count(),
        "td_p50": td.quantile(0.5),
        "td_p99": td.quantile(0.99),
    }


__all__ = ["groupby_aggregate", "topk", "topk_approx", "HyperLogLog", "TDigest", "run_demo"]
