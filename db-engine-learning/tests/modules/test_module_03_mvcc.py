"""Module 03 — tests."""
from __future__ import annotations

import pytest

from db_engine.modules.module_03_mvcc.snapshot import MultiVersionStore


def test_mvcc_snapshot_read():
    s = MultiVersionStore()
    t1 = s.begin(); t1.put("k", "v1"); t1.commit()
    t2 = s.begin(); t2.put("k", "v2"); t2.commit()
    t3 = s.begin()
    assert t3.get("k") == b"v2"


def test_mvcc_aborted_write_invisible():
    s = MultiVersionStore()
    t1 = s.begin(); t1.put("k", "v1"); t1.abort()
    t2 = s.begin()
    assert t2.get("k") is None


def test_mvcc_write_write_conflict():
    s = MultiVersionStore()
    t1 = s.begin(); t1.put("k", "v1")
    t2 = s.begin(); t2.put("k", "v2")
    t2.commit()
    with pytest.raises(RuntimeError):
        t1.commit()


def test_mvcc_serial_snapshot():
    s = MultiVersionStore()
    t1 = s.begin(); t1.put("k", "v1"); t1_ts = t1.commit()
    t2 = s.begin(); snap = t2.get("k")
    assert snap == b"v1"
    t3 = s.begin(); t3.put("k", "v2"); t3.commit()
    snap_t4 = s.begin().get("k")
    assert snap_t4 == b"v2"


def test_mvcc_gc():
    s = MultiVersionStore()
    for i in range(5):
        t = s.begin(); t.put("k", f"v{i}"); t.commit()
    # Many versions exist; GC doesn't fail.
    s.gc(horizon_ts=100)
    assert s.begin().get("k") == b"v4"
