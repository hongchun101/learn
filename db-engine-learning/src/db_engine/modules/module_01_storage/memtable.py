"""An in-memory memtable.

A memtable is the write buffer sitting in front of the LSM tree:
every put goes here first, plus a deletion marker if the key is
deleted. When the memtable fills up it is flushed as an immutable
SSTable.

For the curriculum, the memtable is backed by a `SortedDict`-like
structure using `bisect` over a list of keys.
"""
from __future__ import annotations

from bisect import bisect_left, bisect_right
from dataclasses import dataclass, field


@dataclass(slots=True)
class MemTable:
    max_bytes: int = 1024 * 1024  # 1 MiB threshold before flush.
    _keys: list[bytes] = field(default_factory=list)
    _values: list[bytes | None] = field(default_factory=list)  # None = tombstone

    def __len__(self) -> int:
        return len(self._keys)

    def bytes_used(self) -> int:
        return sum(len(k) + (len(v) if v is not None else 0) for k, v in zip(self._keys, self._values))

    def should_flush(self) -> bool:
        return self.bytes_used() >= self.max_bytes

    def put(self, key: bytes, value: bytes) -> None:
        i = bisect_left(self._keys, key)
        if i < len(self._keys) and self._keys[i] == key:
            self._values[i] = value
            return
        self._keys.insert(i, key)
        self._values.insert(i, value)

    def delete(self, key: bytes) -> None:
        i = bisect_left(self._keys, key)
        if i < len(self._keys) and self._keys[i] == key:
            self._values[i] = None
            return
        self._keys.insert(i, key)
        self._values.insert(i, None)

    def get(self, key: bytes) -> bytes | None:
        i = bisect_left(self._keys, key)
        if i < len(self._keys) and self._keys[i] == key:
            return self._values[i]
        return _MISSING  # marker for "not present in this memtable"

    def items(self) -> list[tuple[bytes, bytes]]:
        return [(k, v) for k, v in zip(self._keys, self._values) if v is not None]


_MISSING = object()


def missing_marker() -> object:
    return _MISSING


def is_missing(v: object) -> bool:
    return v is _MISSING


__all__ = ["MemTable", "is_missing", "missing_marker"]
