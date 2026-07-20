"""Module 01 — tests."""
from __future__ import annotations

import pytest

from db_engine.modules.module_01_storage.btree import BPlusTree
from db_engine.modules.module_01_storage.inmem import RowStore
from db_engine.modules.module_01_storage.lsm import LSMTree
from db_engine.modules.module_01_storage.slotted import (
    SlottedPage,
    decode_row,
    encode_row,
)
from db_engine.modules.module_01_storage.sstable import SSTable
from db_engine.shared.types import RowId


def test_slotted_insert_read():
    p = SlottedPage.empty(page_id=1)
    rid0 = p.insert_row(encode_row([1, "alice", True]))
    rid1 = p.insert_row(encode_row([2, "bob", False]))
    assert decode_row(p.read(rid0)) == [1, "alice", True]
    assert decode_row(p.read(rid1)) == [2, "bob", False]


def test_slotted_delete_marks_slot():
    p = SlottedPage.empty(page_id=1)
    rid = p.insert_row(encode_row([1, "x", True]))
    p.delete(rid)
    assert p.read(rid) == b""  # zero-length


def test_bptree_basic():
    bt = BPlusTree(order=4)
    for i in range(16):
        bt.put(i, RowId(0, i))
    assert bt.get(7) == RowId(0, 7)
    assert len(bt) == 16


def test_bptree_range():
    bt = BPlusTree(order=4)
    for i in range(16):
        bt.put(i, RowId(0, i))
    rids = bt.range_get(3, 9)
    assert sorted(r.slot_id for r in rids) == list(range(3, 10))


def test_sstable_get():
    items = [(f"k{i:02d}".encode(), f"v{i:02d}".encode()) for i in range(8)]
    sst = SSTable.from_sorted_items(items)
    assert sst.get(b"k03") == b"v03"
    assert sst.get(b"kZZ") is None


def test_lsm_roundtrip():
    lsm = LSMTree(memtable_max_bytes=64)
    lsm.put("alpha", "1")
    lsm.put("bravo", "2")
    assert lsm.get("alpha") == b"1"
    assert lsm.get("bravo") == b"2"
    assert lsm.get("missing") is None


def test_lsm_delete_isolation():
    lsm = LSMTree(memtable_max_bytes=64)
    lsm.put("k", "v")
    lsm.delete("k")
    assert lsm.get("k") is None


def test_rowstore_contract():
    rs = RowStore()
    rs.put("a", "1")
    assert rs.get("a") == b"1"
    assert rs.delete("a")
    assert rs.get("a") is None
