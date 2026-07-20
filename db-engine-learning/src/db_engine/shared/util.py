"""Small helpers used by several chapters.

`now()`: monotonic microsecond timestamp.

`stable_hash()`: a deterministic hash so tests are reproducible.

`human()`: a tiny formatter for EXPLAIN output.
"""
from __future__ import annotations

import hashlib
import struct
import time
from collections.abc import Iterable
from typing import TypeVar

T = TypeVar("T")

_CLOCK = time.perf_counter
_ORIGIN_NS = time.perf_counter_ns()


def now() -> int:
    """Monotonically increasing microsecond timestamp.

    Uses `perf_counter`; the value is opaque (do not subtract across
    processes) but always increasing inside one process.
    """
    return time.perf_counter_ns() - _ORIGIN_NS


def stable_hash(*parts: object) -> int:
    """A 64-bit stable hash of the parts.

    Deterministic across runs and machines; useful for deterministic
    tests and for stable KV ordering.
    """
    h = hashlib.blake2b(digest_size=8)
    for p in parts:
        h.update(repr(p).encode())
        h.update(b"\x1f")  # ASCII unit separator
    return struct.unpack("<Q", h.digest())[0]


def human(n: int) -> str:
    """Format an integer with K/M/G separators for tables."""
    if n < 10_000:
        return str(n)
    if n < 1_000_000:
        return f"{n / 1000:.1f}K"
    if n < 1_000_000_000:
        return f"{n / 1_000_000:.1f}M"
    return f"{n / 1_000_000_000:.1f}G"


def first(it: Iterable[T], default: T | None = None) -> T | None:
    """Return the first element of `it`, or `default` if it is empty."""
    for x in it:
        return x
    return default


def chunked(seq: list[T], n: int) -> list[list[T]]:
    """Split `seq` into chunks of size `n`. Last chunk may be shorter."""
    return [seq[i : i + n] for i in range(0, len(seq), n)]


__all__ = ["now", "stable_hash", "human", "first", "chunked"]
