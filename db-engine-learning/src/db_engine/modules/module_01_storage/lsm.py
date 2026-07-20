"""The LSM tree.

Production `LSM = memtable + immutable runs + compaction`. Chapter 01
implements the data path; chapter 02 adds WAL; chapter 09 adds bloom
filtering and compaction policies.

`LSMTree` is the canonical `Storage` of the curriculum. It satisfies
the `Storage` contract in `_contracts/storage.py`.
"""
from __future__ import annotations

from typing import Iterator

from db_engine._contracts.storage import Storage
from db_engine.modules.module_01_storage.memtable import MemTable, is_missing, missing_marker
from db_engine.modules.module_01_storage.sstable import SSTable
from db_engine.shared.types import PageId, Row, RowId


class LSMTree(Storage):
    """A pure-memory LSM tree.

    Two main reads:
      - `get(key)`: memtable → run[0] → run[1] → ...
    Two main writes:
      - `put(key, value)`: memtable only
      - `delete(key)`: memtable tombstone
    Flushes:
      - When the memtable fills, flush to a new SSTable and rebuild.
    """

    def __init__(self, memtable_max_bytes: int = 4096) -> None:
        self.memtable = MemTable(max_bytes=memtable_max_bytes)
        self.runs: list[SSTable] = []
        self._next_rid: tuple[PageId, int] = (0, 0)
        self._rows: dict[bytes, Row] = {}

    def _alloc_rid(self) -> RowId:
        page, slot = self._next_rid
        self._next_rid = (page, slot + 1)
        return RowId(page, slot)

    # -------------------------------------------------------------------
    # Storage contract
    # -------------------------------------------------------------------

    def put(self, key: bytes | str, value: bytes | str) -> RowId:
        kb = key.encode() if isinstance(key, str) else key
        vb = value.encode() if isinstance(value, str) else value
        self.memtable.put(kb, vb)
        rid = self._alloc_rid()
        self._rows[kb] = Row(rid=rid, values=[vb])
        if self.memtable.should_flush():
            self._flush()
        return rid

    def get(self, key: bytes | str) -> bytes | None:
        kb = key.encode() if isinstance(key, str) else key
        v = self.memtable.get(kb)
        if v is missing_marker():
            pass
        elif v is None:
            # Tombstone; key logically absent.
            return None
        else:
            return v
        for run in self.runs:
            v = run.get(kb)
            if v is not None:
                return v
        return None

    def delete(self, key: bytes | str) -> bool:
        kb = key.encode() if isinstance(key, str) else key
        existed = self.get(kb) is not None
        self.memtable.delete(kb)
        self._rows.pop(kb, None)
        if self.memtable.should_flush():
            self._flush()
        return existed

    def scan(self) -> Iterator[Row]:
        for kb, row in self._rows.items():
            yield row

    def sync(self) -> None:
        # In-memory; nothing to fsync. Real engines would fsync the WAL.
        return

    def close(self) -> None:
        return

    # -------------------------------------------------------------------
    # Flush + compaction
    # -------------------------------------------------------------------

    def _flush(self) -> None:
        items = self.memtable.items()
        if items:
            run = SSTable.from_sorted_items(items)
            self.runs.append(run)
        # Rebuild memtable so a new batch can accumulate.
        self.memtable = MemTable(max_bytes=self.memtable.max_bytes)

    def compact(self) -> None:
        """Naive compaction: merge all runs into one.

        Tombstones are dropped (the last writer wins). Real engines
        keep track of "lowest level" tombstones and only drop them
        after they have propagated through all levels.
        """
        seen: dict[bytes, bytes] = {}
        for run in self.runs:
            for k, v in run.scan():
                seen[k] = v
        new = SSTable.from_sorted_items(seen.items())
        self.runs = [new]
