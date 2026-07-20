"""The Transaction contract — Chapter 02 introduces it.

A `Transaction` is the unit of atomicity in the engine. It records
write sets, ensures commit or abort, and is the integration point with
the WAL.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum


class TxnStatus(str, Enum):
    ACTIVE = "ACTIVE"
    COMMITTED = "COMMITTED"
    ABORTED = "ABORTED"


class Transaction(ABC):
    """A live transaction.

    Contract:
      - `put(key, value)` records a write in the write set.
      - `get(key)` returns the latest value visible to this txn.
      - `commit()` makes writes durable; on failure raises.
      - `abort()` discards writes.
      - Once committed or aborted, no further method is valid; the txn
        becomes immutable and `status == COMMITTED` or `ABORTED`.
    """

    @property
    @abstractmethod
    def id(self) -> int: ...

    @property
    @abstractmethod
    def status(self) -> TxnStatus: ...

    @abstractmethod
    def put(self, key: bytes | str, value: bytes | str) -> None: ...

    @abstractmethod
    def get(self, key: bytes | str) -> bytes | str | None: ...

    @abstractmethod
    def commit(self) -> None: ...

    @abstractmethod
    def abort(self) -> None: ...
