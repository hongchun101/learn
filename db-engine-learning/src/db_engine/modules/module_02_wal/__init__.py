"""Module 02 — write-ahead log + recovery (ARIES-lite).

What's inside:
- `log_record.py` — the page-leveL record format
- `wal.py` — append-only log + a tiny log buffer
- `recovery.py` — ARIES-lite: replay + undo for crash recovery

The Transaction contract (`db_engine._contracts.transaction`) is
satisfied by `WALTransaction`, which records every put in the log
and applies it to the underlying `Storage` only when `commit()` fsyncs
the COMMIT record.
"""
from __future__ import annotations

from db_engine.modules.module_02_wal.log_record import LogRecord, LogKind
from db_engine.modules.module_02_wal.wal import WriteAheadLog, WALTransaction
from db_engine.modules.module_02_wal.recovery import recover

__all__ = ["LogRecord", "LogKind", "WriteAheadLog", "WALTransaction", "recover"]
