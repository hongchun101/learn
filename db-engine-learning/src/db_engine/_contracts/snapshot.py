"""The Snapshot contract — Chapter 03 introduces it.

A `Snapshot` is a read-as-of a particular timestamp with conflict
detection on commit. Used by the executor to ensure repeatable reads
and by the optimiser to compute per-txn visibility.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from db_engine.shared.types import Ts, TxnId


class Snapshot(ABC):
    """A read view + commit-time conflict check.

    Contract:
      - `read_ts` is the (read-side) timestamp of this snapshot.
      - `writer_conflict(other_txn)` returns True if `other_txn` wrote
        to any key that this snapshot also wrote or read.
      - `add_read(key)` records a read for conflict tracking.
      - `add_write(key)` records a write for conflict tracking.
    """

    @property
    @abstractmethod
    def read_ts(self) -> Ts: ...

    @property
    @abstractmethod
    def txn_id(self) -> TxnId: ...

    @abstractmethod
    def add_read(self, key: bytes | str) -> None: ...

    @abstractmethod
    def add_write(self, key: bytes | str) -> None: ...

    @abstractmethod
    def writer_conflict(self, other_txn_id: TxnId) -> bool: ...

    @abstractmethod
    def snapshot_of(self, other_txn_id: TxnId, commit_ts: Ts) -> bool:
        """Did `other_txn_id` commit at or before this snapshot's `read_ts`?"""
        ...
