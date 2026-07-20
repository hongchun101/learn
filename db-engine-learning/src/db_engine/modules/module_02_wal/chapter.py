"""Module 02 — chapter narrative."""
from __future__ import annotations

import io

from db_engine._contracts.storage import Storage
from db_engine.modules.module_01_storage.inmem import RowStore
from db_engine.modules.module_02_wal.recovery import recover
from db_engine.modules.module_02_wal.wal import WriteAheadLog


def run_demo() -> dict:
    storage: Storage = RowStore()
    log = WriteAheadLog(sink=io.BytesIO())
    txn = log.begin()
    txn.put("a", "1")
    txn.put("b", "2")
    txn.commit()

    out: dict = {}
    out["committed_a"] = storage.get("a")  # Not yet; it lives only in the log.
    out["log_records"] = sum(1 for _ in log.iter_records())

    # Crash: storage is empty, log has BEGIN / UPDATE / UPDATE / COMMIT.
    storage2: Storage = RowStore()
    recover(log, storage2)
    out["after_recover"] = {
        "a": storage2.get("a"),
        "b": storage2.get("b"),
    }

    # Aborted txn: must NOT be replayed.
    log2 = WriteAheadLog(sink=io.BytesIO())
    t = log2.begin()
    t.put("x", "y")
    t.abort()
    storage3: Storage = RowStore()
    recover(log2, storage3)
    out["abort_replay"] = storage3.get("x")
    return out


if __name__ == "__main__":
    import json
    print(json.dumps(run_demo(), indent=2, default=str))
