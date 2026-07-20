"""The Storage contract — Chapter 01 introduces it.

A `Storage` is the lowest-level primitive in the engine: a key/value
store with scan, atomic put, and delete. It is the only surface that
persists data; everything above it (WAL, MVCC, indexes, executor)
sits on top.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterator

from db_engine.shared.types import Row, RowId, Value


class Storage(ABC):
    """Key/value storage with append-only durability.

    Contract:
      - `put(key, value)` returns the assigned row id.
      - `get(key)` returns the value or `None` if absent.
      - `delete(key)` makes subsequent `get` return `None`.
      - `scan()` returns all rows in (storage-defined) order.
      - All operations are durable; a process that crashed and recovered
        sees the same state as before the crash.

    This is deliberately narrower than a SQL table: no schema, no
    transactions. The Transaction contract in `transaction.py` lifts
    it to a transactional interface; the Executor contract reuses
    the same `Storage` underneath.
    """

    @abstractmethod
    def put(self, key: bytes | str, value: bytes | str) -> RowId: ...

    @abstractmethod
    def get(self, key: bytes | str) -> bytes | str | None: ...

    @abstractmethod
    def delete(self, key: bytes | str) -> bool: ...

    @abstractmethod
    def scan(self) -> Iterator[Row]: ...

    @abstractmethod
    def sync(self) -> None:
        """Force a fsync-equivalent barrier."""
        ...

    @abstractmethod
    def close(self) -> None: ...
