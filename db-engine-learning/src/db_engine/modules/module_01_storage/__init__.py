"""Chapter 01 — storage engine (B+Tree + LSM).

Implements:
- `SlottedPage`: page layout with header, slot array, free space pointer
- `BPlusTree`: on-disk clustered index with 4 KiB nodes
- `SSTable`: append-only immutable run with sparse index + bloom filter
- `MemTable`: in-memory write buffer for the LSM tree
- `LSMTree`: orchestrator for memtable + sorted runs + compaction

The Storage contract (`db_engine._contracts.storage`) is satisfied by:
- `LSMTree` (the production choice)
- `BPlusTree` (the alternative)

A small in-memory `RowStore` is also provided for tests that do not want
to touch disk. Every implementation of the `Storage` contract satisfies:

    put(k, v) -> RowId
    get(k) -> v | None
    delete(k) -> bool
    scan() -> Iterator[Row]
    sync() -> None
    close() -> None
"""
from __future__ import annotations

from db_engine.modules.module_01_storage.slotted import SlottedPage, encode_row, decode_row
from db_engine.modules.module_01_storage.btree import BPlusTree
from db_engine.modules.module_01_storage.sstable import SSTable
from db_engine.modules.module_01_storage.memtable import MemTable
from db_engine.modules.module_01_storage.lsm import LSMTree
from db_engine.modules.module_01_storage.inmem import RowStore

__all__ = [
    "SlottedPage",
    "encode_row",
    "decode_row",
    "BPlusTree",
    "SSTable",
    "MemTable",
    "LSMTree",
    "RowStore",
]
