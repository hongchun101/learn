"""An SSTable (sorted string table).

Immutable, on-disk, sorted by key. This is the unit of compaction in
an LSM tree. The on-disk format (used by LevelDB and RocksDB) is:

    data block:      key/value pairs, sorted
    index block:     every K-th key, with offset into the data block
    bloom filter:    per-key "definitely absent" check
    meta block:      min/max key, count, size
    footer:          offsets of the previous blocks

For the curriculum we keep an in-memory SSTable that preserves the
*interface*: lookup is one binary search in the sparse index, then a
small linear scan within the block. Bloom filter is on the side.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Iterable

from db_engine.shared.util import chunked


def _bloom_add(filters: bytearray, slots: int, item: bytes) -> None:
    """Insert `item` into a bit array of `slots` bits using FNV-style hashes."""
    h1 = _fnv1a_64(item)
    h2 = _fnv1a_64(item + b"\xff")
    for i in range(4):
        bit = (h1 + i * h2) % (slots * 8)
        filters[bit // 8] |= 1 << (bit % 8)


def _bloom_might_contain(filters: bytearray, slots: int, item: bytes) -> bool:
    h1 = _fnv1a_64(item)
    h2 = _fnv1a_64(item + b"\xff")
    for i in range(4):
        bit = (h1 + i * h2) % (slots * 8)
        if not (filters[bit // 8] & (1 << (bit % 8))):
            return False
    return True


def _fnv1a_64(b: bytes) -> int:
    h = 0xCBF29CE484222325
    for x in b:
        h = (h ^ x) * 0x100000001B3 & 0xFFFFFFFFFFFFFFFF
    return h


@dataclass(slots=True)
class SSTable:
    """An immutable sorted run.

    Build with `SSTable.from_sorted_items(items)`. Reads: `get`, `scan`.
    """

    min_key: bytes
    max_key: bytes
    pairs: list[tuple[bytes, bytes]]  # sorted, ascending
    index: list[tuple[bytes, int]]  # (key, position-in-pairs) every K
    index_step: int
    bloom: bytearray
    bloom_slots: int

    @classmethod
    def from_sorted_items(
        cls,
        items: Iterable[tuple[bytes, bytes]],
        index_step: int = 16,
        bloom_slots: int = 1024,
    ) -> "SSTable":
        pairs = sorted(items)
        index = [(k, i) for i, (k, _) in enumerate(pairs) if i % index_step == 0]
        bloom = bytearray(bloom_slots)
        for k, _ in pairs:
            _bloom_add(bloom, bloom_slots, k)
        if pairs:
            min_key, max_key = pairs[0][0], pairs[-1][0]
        else:
            min_key, max_key = b"", b""
        return cls(min_key, max_key, pairs, index, index_step, bloom, bloom_slots)

    # -------------------------------------------------------------------
    # Reads
    # -------------------------------------------------------------------

    def might_contain(self, key: bytes) -> bool:
        return _bloom_might_contain(self.bloom, self.bloom_slots, key)

    def get(self, key: bytes) -> bytes | None:
        if not self.pairs:
            return None
        if not (self.min_key <= key <= self.max_key):
            return None
        if not self.might_contain(key):
            return None
        # Locate the block via the sparse index.
        lo = 0
        for k, pos in self.index:
            if k <= key:
                lo = pos
            else:
                break
        hi = min(lo + self.index_step, len(self.pairs))
        # Linear scan inside the block (binary-search would also work).
        for i in range(lo, hi):
            k, v = self.pairs[i]
            if k == key:
                return v
            if k > key:
                return None
        return None

    def scan(self) -> Iterable[tuple[bytes, bytes]]:
        yield from self.pairs


__all__ = ["SSTable"]
