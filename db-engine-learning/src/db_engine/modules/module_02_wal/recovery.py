"""ARIES-lite recovery.

Pass 1: walk the log; collect committed txns and aborted txns.
Pass 2: walk again; replay every UPDATE of a committed txn.

For the curriculum, recovery is simplified:
  - A UPDATE record of a committed txn writes to storage in order.
  - An UPDATE record of an aborted/unfinished txn is skipped.
This suffices for the WAL contract; real ARIES needs LSNs, dirty pages,
and fuzzy checkpoints.
"""
from __future__ import annotations

from db_engine._contracts.storage import Storage
from db_engine.modules.module_02_wal.log_record import LogKind
from db_engine.modules.module_02_wal.wal import WriteAheadLog


def recover(log: WriteAheadLog, storage: Storage) -> None:
    """Replay committed writes onto `storage` in order."""
    committed: set[int] = set()
    aborted: set[int] = set()
    for record in log.iter_records():
        if record.kind is LogKind.COMMIT:
            committed.add(record.txn_id)
        elif record.kind is LogKind.ABORT:
            aborted.add(record.txn_id)

    for record in log.iter_records():
        if record.kind is LogKind.UPDATE and record.txn_id in committed and record.txn_id not in aborted:
            assert record.key is not None
            storage.put(record.key, record.value if record.value is not None else b"")
            storage.sync()
