"""Chapter 01 — narrative.

Every chapter has a short narrative file. The runnable code lives
in the other files; tests live in `tests/modules/test_module_01_*`.
"""
from __future__ import annotations

from db_engine.modules.module_01_storage.slotted import SlottedPage, encode_row, decode_row
from db_engine.modules.module_01_storage.btree import BPlusTree
from db_engine.modules.module_01_storage.sstable import SSTable
from db_engine.modules.module_01_storage.memtable import MemTable
from db_engine.modules.module_01_storage.lsm import LSMTree
from db_engine.modules.module_01_storage.inmem import RowStore


def run_demo() -> dict:
    """Run the canonical chapter 01 demo.

    Returns a dict describing what happened so the capstone + tests
    can assert the demo.
    """
    out: dict = {}

    # Slotted pages: insert four rows, read them back, delete one.
    sp = SlottedPage.empty(page_id=1)
    rid0 = sp.insert_row(encode_row([1, "alice", True]))
    rid1 = sp.insert_row(encode_row([2, "bob", False]))
    rid2 = sp.insert_row(encode_row([3, "carol", True]))
    out["slotted"] = {
        "rid0": rid0,
        "rid1": rid1,
        "rid2": rid2,
        "row0": decode_row(sp.read(rid0)),
        "row1": decode_row(sp.read(rid1)),
        "row2": decode_row(sp.read(rid2)),
        "free_after": sp.free_space(),
    }

    # B+Tree: insert 16 keys, retrieve, range.
    bt = BPlusTree(order=4)
    for i in range(16):
        bt.put(i, RowId(page_id=0, slot_id=i))
    out["btree"] = {
        "size": len(bt),
        "get_7": bt.get(7),
        "range_3_9": [r.slot_id for r in bt.range_get(3, 9)],
    }

    # SSTable: build + read.
    items = [(f"k{i:02d}".encode(), f"v{i:02d}".encode()) for i in range(8)]
    sst = SSTable.from_sorted_items(items)
    out["sstable"] = {
        "k3": sst.get(b"k03"),
        "k_missing": sst.get(b"kZZ"),
        "min": sst.min_key.decode(),
        "max": sst.max_key.decode(),
    }

    # LSM tree: end-to-end of the Storage contract.
    lsm = LSMTree(memtable_max_bytes=4096)
    lsm.put("alpha", "1")
    lsm.put("bravo", "2")
    lsm.put("charlie", "3")
    out["lsm"] = {
        "alpha": lsm.get("alpha"),
        "charlie": lsm.get("charlie"),
        "missing": lsm.get("delta"),
        "delete_alpha": lsm.delete("alpha"),
        "alpha_after_delete": lsm.get("alpha"),
        "rows": sum(1 for _ in lsm.scan()),
    }

    return out


if __name__ == "__main__":
    import json
    print(json.dumps(run_demo(), indent=2, default=str))
