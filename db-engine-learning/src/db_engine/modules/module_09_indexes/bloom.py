"""Bloom filter — definite-absent / probable-present.

A bit array with k independent hash functions. False-positive
probability: (1 - e^(-k*n/m))^k. Production: m/n ~10, k=7 ⇒ ≈1%.
"""
from __future__ import annotations


def _hash(b: bytes, seed: int) -> int:
    h = seed
    for x in b:
        h = ((h * 0x100000001B3) ^ x) & 0xFFFFFFFFFFFFFFFF
    return h


class BloomFilter:
    def __init__(self, size_bits: int = 1024, k: int = 4) -> None:
        self.size_bits = size_bits
        self.k = k
        self.bits = bytearray(size_bits // 8)

    def add(self, item: bytes | int | str) -> None:
        if isinstance(item, str):
            item = item.encode()
        elif isinstance(item, int):
            item = str(item).encode()
        for s in range(self.k):
            bit = _hash(item, s) % self.size_bits
            self.bits[bit // 8] |= 1 << (bit % 8)

    def __contains__(self, item: bytes | int | str) -> bool:
        if isinstance(item, str):
            item = item.encode()
        elif isinstance(item, int):
            item = str(item).encode()
        for s in range(self.k):
            bit = _hash(item, s) % self.size_bits
            if not (self.bits[bit // 8] & (1 << (bit % 8))):
                return False
        return True


__all__ = ["BloomFilter"]
