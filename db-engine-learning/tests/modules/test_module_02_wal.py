"""Module 02 — tests."""
from __future__ import annotations

import io

from db_engine.modules.module_01_storage.inmem import RowStore
from db_engine.modules.module_02_wal.log_record import LogKind, LogRecord
from db_engine.modules.module_02_wal.recovery import recover
from db_engine.modules.module_02_wal.wal import WriteAheadLog


def test_log_record_roundtrip():
    r = LogRecord(kind=LogKind.UPDATE, txn_id=1, key=b"a", value=b"1")
    enc = r.encode()
    dec = LogRecord.decode(enc)
    assert dec.kind == LogKind.UPDATE
    assert dec.txn_id == 1
    assert dec.key == b"a"
    assert dec.value == b"1"


def test_log_record_tombstone():
    r = LogRecord(kind=LogKind.UPDATE, txn_id=1, key=b"a", value=None)
    dec = LogRecord.decode(r.encode())
    assert dec.value is None


def test_recovery_replays_committed_only():
    sink = io.BytesIO()
    log = WriteAheadLog(sink=sink)
    t = log.begin()
    t.put("a", "1")
    t.put("b", "2")
    t.commit()

    rs = RowStore()
    recover(log, rs)
    assert rs.get("a") == b"1"
    assert rs.get("b") == b"2"


def test_recovery_skips_aborted():
    sink = io.BytesIO()
    log = WriteAheadLog(sink=sink)
    t = log.begin()
    t.put("x", "y")
    t.abort()

    rs = RowStore()
    recover(log, rs)
    assert rs.get("x") is None
