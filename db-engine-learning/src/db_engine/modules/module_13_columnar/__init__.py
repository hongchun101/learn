"""Module 13 — columnar storage + encodings.

Encodings covered:
- Run-length encoding (RLE)
- Dictionary encoding
- Delta encoding (for monotone columns)
- Bitset packing

Use them in `ColumnBuffer.encode/decode`.
"""
from __future__ import annotations

from array import array
from typing import Any


def rle_encode(values: list[int]) -> tuple[list[int], list[int]]:
    """Run-length encode `values` into (values, run_lengths)."""
    if not values:
        return [], []
    out_v = [values[0]]
    out_l = [1]
    for v in values[1:]:
        if v == out_v[-1]:
            out_l[-1] += 1
        else:
            out_v.append(v)
            out_l.append(1)
    return out_v, out_l


def rle_decode(values: list[int], lengths: list[int]) -> list[int]:
    out: list[int] = []
    for v, l in zip(values, lengths, strict=True):
        out.extend([v] * l)
    return out


class Dictionary:
    def __init__(self) -> None:
        self._table: dict[Any, int] = {}
        self._inv: list[Any] = []
        self._codes: list[int] = []

    def add(self, v: Any) -> int:
        if v not in self._table:
            self._table[v] = len(self._inv)
            self._inv.append(v)
        self._codes.append(self._table[v])
        return self._table[v]

    def finalize(self) -> "Dictionary":
        return self

    def codes(self) -> list[int]:
        return list(self._codes)

    def lookup(self, code: int) -> Any:
        return self._inv[code]


def delta_encode(values: list[int]) -> list[int]:
    if not values:
        return []
    out = [values[0]]
    for i in range(1, len(values)):
        out.append(values[i] - values[i - 1])
    return out


def delta_decode(deltas: list[int]) -> list[int]:
    out = []
    acc = 0
    for d in deltas:
        acc += d
        out.append(acc)
    return out


def bitset_pack(values: list[bool]) -> tuple[int, list[int]]:
    """Pack a list of booleans into 32-bit ints.

    Returns `(num_words, words)`. The storage layer keeps `(num_words, words)`.
    """
    n = len(values)
    num_words = (n + 31) // 32
    words = [0] * num_words
    for i, v in enumerate(values):
        if v:
            words[i // 32] |= 1 << (i % 32)
    return num_words, words


class ColumnBuffer:
    """A typed column buffer with optional encoding."""

    __slots__ = ("name", "encoding", "data", "aux")

    def __init__(self, name: str, encoding: str, data: Any, aux: Any | None = None) -> None:
        self.name = name
        self.encoding = encoding
        self.data = data
        self.aux = aux

    def __len__(self) -> int:
        return len(self.data)


def run_demo() -> dict:
    raw = [1, 1, 1, 2, 2, 3, 3, 3, 3, 0]
    enc = rle_encode(raw)
    dec = rle_decode(*enc)
    d = Dictionary()
    for v in ["a", "b", "a", "c", "b", "a"]:
        d.add(v)
    deltas = delta_encode([10, 11, 13, 18, 19, 30])
    bits = bitset_pack([True, False, True, True, False, True])
    return {
        "rle_compressed_len": len(enc[0]),
        "rle_roundtrip": dec,
        "dict_unique": len(d._inv),
        "delta_decoded": delta_decode(deltas),
        "bits_words": bits[1][:1],
    }


__all__ = [
    "rle_encode",
    "rle_decode",
    "Dictionary",
    "delta_encode",
    "delta_decode",
    "bitset_pack",
    "ColumnBuffer",
    "run_demo",
]
