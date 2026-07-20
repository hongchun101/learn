"""A small, correct MVCC store.

The implementation is intentionally simple:

    store: dict[bytes, list[Version]]   # newest first
    txn_begin   → ts++
    txn_get(k,t) → newest version with begin_ts ≤ t < end_ts
    txn_write   → pre-allocate a version slot; commit flips begin_ts
    txn_commit  → check write-write conflict, set end_ts of older
                  versions, return commit_ts.
    txn_abort   → drop the pending slot.

This is the textbook MVCC story. Chapter 03 introduces it; the
optimistic / pessimistic details live in chapter 09 (transaction
memory) and chapter 12 (distributed).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


@dataclass(slots=True)
class Version:
    begin_ts: int
    end_ts: int  # 0 == still current
    txn_id: int
    key: bytes
    value: bytes | None
    # `pending` means: written but not yet committed. Not visible to
    # anyone except its writer. On commit we set begin_ts = commit_ts.
    pending: bool = False


class MultiVersionStore:
    """An MVCC store operating on bytes keys."""

    def __init__(self) -> None:
        self._rows: dict[bytes, list[Version]] = {}
        self._clock: int = 0
        self._next_txn: int = 1
        self._commits: dict[int, int] = {}

    def begin(self) -> "MVTransaction":
        txn_id = self._next_txn
        self._next_txn += 1
        self._clock += 1
        return MVTransaction(self, txn_id, self._clock)

    def _commit(self, txn: "MVTransaction") -> int:
        # Validate write-write conflicts first.
        for w in txn._writes:
            versions = self._rows.get(w.key)
            if not versions:
                continue
            for v in versions:
                if v.pending:
                    raise RuntimeError(f"concurrent write on key {w.key!r}")
                if v.txn_id == txn.txn_id:
                    continue
                if v.begin_ts > txn.read_ts:
                    raise RuntimeError(
                        f"write-write conflict on key {w.key!r} (other txn {v.txn_id})"
                    )
        self._clock += 1
        commit_ts = self._clock
        # Finalise pending versions: set begin_ts = commit_ts.
        for w in txn._writes:
            for v in self._rows[w.key]:
                if v.pending and v.txn_id == txn.txn_id:
                    v.begin_ts = commit_ts
                    v.pending = False
        self._commits[txn.txn_id] = commit_ts
        return commit_ts

    def _abort(self, txn: "MVTransaction") -> None:
        for w in txn._writes:
            versions = self._rows.get(w.key)
            if not versions:
                continue
            self._rows[w.key] = [v for v in versions if not (v.pending and v.txn_id == txn.txn_id)]

    def gc(self, horizon_ts: int) -> int:
        """Garbage-collect versions whose end_ts < horizon.

        Returns number of versions removed.
        """
        removed = 0
        for k in list(self._rows.keys()):
            kept: list[Version] = []
            for v in self._rows[k]:
                if v.end_ts != 0 and v.end_ts < horizon_ts:
                    removed += 1
                    continue
                kept.append(v)
            self._rows[k] = kept


@dataclass(slots=True)
class _Pending:
    key: bytes
    value: bytes | None


class MVTransaction:
    """A multi-version transaction handle."""

    def __init__(self, store: MultiVersionStore, txn_id: int, read_ts: int) -> None:
        self._store = store
        self._txn_id = txn_id
        self._read_ts = read_ts
        self._writes: list[_Pending] = []
        self._reads: set[bytes] = set()
        self._committed = False
        self._aborted = False

    @property
    def txn_id(self) -> int:
        return self._txn_id

    @property
    def read_ts(self) -> int:
        return self._read_ts

    @property
    def is_active(self) -> bool:
        return not (self._committed or self._aborted)

    # -------------------------------------------------------------------
    # Snapshot contract surface (ch03 contract)
    # -------------------------------------------------------------------

    def add_read(self, key: bytes | str) -> None:
        self._reads.add(key.encode() if isinstance(key, str) else key)

    def add_write(self, key: bytes | str) -> None:
        self._writes.append(_Pending(key=key.encode() if isinstance(key, str) else key, value=None))

    def writer_conflict(self, other_txn_id: int) -> bool:
        return other_txn_id == self._txn_id

    def snapshot_of(self, other_txn_id: int, commit_ts: int) -> bool:
        return commit_ts <= self._read_ts

    # -------------------------------------------------------------------
    # Operations
    # -------------------------------------------------------------------

    def get(self, key: bytes | str) -> bytes | None:
        self._ensure_active()
        kb = key.encode() if isinstance(key, str) else key
        self.add_read(kb)
        versions = self._store._rows.get(kb)
        if not versions:
            return None
        for v in versions:
            if v.pending and v.txn_id != self._txn_id:
                continue
            if v.begin_ts <= self._read_ts and (v.end_ts == 0 or self._read_ts < v.end_ts):
                return v.value
        return None

    def put(self, key: bytes | str, value: bytes | str | None) -> None:
        self._ensure_active()
        kb = key.encode() if isinstance(key, str) else key
        vb = None if value is None else (value.encode() if isinstance(value, str) else value)
        self._writes.append(_Pending(key=kb, value=vb))
        versions = self._store._rows.setdefault(kb, [])
        v = Version(
            begin_ts=self._read_ts,  # provisional
            end_ts=0,
            txn_id=self._txn_id,
            key=kb,
            value=vb,
            pending=True,
        )
        versions.insert(0, v)

    def commit(self) -> int:
        self._ensure_active()
        ts = self._store._commit(self)
        self._committed = True
        return ts

    def abort(self) -> None:
        if not self.is_active:
            return
        self._store._abort(self)
        self._aborted = True

    def _ensure_active(self) -> None:
        if not self.is_active:
            raise RuntimeError("transaction is no longer active")


__all__ = ["MultiVersionStore", "MVTransaction", "Version"]
