"""Write-ahead log + WAL-based transactions.

Each `put` is appended to the log BEFORE it reaches the underlying
storage. On `commit`, a COMMIT record is appended and the log is
fsync-equivalent-flushed. On `abort`, an ABORT record.

Recovery replays all committed updates; aborts are skipped.
"""
from __future__ import annotations

import io
from typing import Iterator

from db_engine._contracts.storage import Storage
from db_engine._contracts.transaction import Transaction, TxnStatus
from db_engine.modules.module_02_wal.log_record import LogKind, LogRecord


class WriteAheadLog:
    """An in-memory WAL.

    Real engines would use a buffered file; for the curriculum, an
    in-memory buffer exercises every code path except fsync. Replace
    `io.BytesIO` with an `open(path, "ab")` to run with persistence.
    """

    def __init__(self, sink: io.BytesIO | None = None) -> None:
        self._sink = sink if sink is not None else io.BytesIO()
        self._next_txn: int = 1
        self._buffer: io.BytesIO = io.BytesIO()

    @property
    def sink(self) -> io.BytesIO:
        return self._sink

    def append(self, record: LogRecord) -> None:
        encoded = record.encode()
        self._buffer.write(encoded)

    def flush(self) -> None:
        """Equivalent of fsync — durable barrier."""
        self._sink.write(self._buffer.getvalue())
        self._buffer = io.BytesIO()

    def iter_records(self) -> Iterator[LogRecord]:
        """Replay from the sink."""
        self._sink.seek(0)
        data = self._sink.getvalue()
        off = 0
        while off < len(data):
            if off + 4 > len(data):
                break
            length = int.from_bytes(data[off : off + 4], "little")
            off += 4
            if off + length > len(data):
                break
            buf = data[off - 4 : off + length]
            yield LogRecord.decode(buf)
            off += length

    def begin(self) -> "WALTransaction":
        tid = self._next_txn
        self._next_txn += 1
        self.append(LogRecord(kind=LogKind.BEGIN, txn_id=tid))
        return WALTransaction(tid, self)


class WALTransaction(Transaction):
    def __init__(self, txn_id: int, wal: WriteAheadLog) -> None:
        self._id = txn_id
        self._wal = wal
        self._status = TxnStatus.ACTIVE
        self._writes: dict[bytes, bytes | None] = {}

    @property
    def id(self) -> int:
        return self._id

    @property
    def status(self) -> TxnStatus:
        return self._status

    def _ensure_active(self) -> None:
        if self._status is not TxnStatus.ACTIVE:
            raise RuntimeError(f"transaction {self._id} is {self._status}")

    def put(self, key: bytes | str, value: bytes | str) -> None:
        self._ensure_active()
        kb = key.encode() if isinstance(key, str) else key
        vb = value.encode() if isinstance(value, str) else value
        self._writes[kb] = vb
        self._wal.append(LogRecord(kind=LogKind.UPDATE, txn_id=self._id, key=kb, value=vb))

    def get(self, key: bytes | str) -> bytes | str | None:  # type: ignore[override]
        self._ensure_active()
        kb = key.encode() if isinstance(key, str) else key
        return self._writes.get(kb)

    def commit(self) -> None:
        self._ensure_active()
        self._wal.append(LogRecord(kind=LogKind.COMMIT, txn_id=self._id))
        self._wal.flush()
        self._status = TxnStatus.COMMITTED

    def abort(self) -> None:
        if self._status is not TxnStatus.ACTIVE:
            return
        self._wal.append(LogRecord(kind=LogKind.ABORT, txn_id=self._id))
        self._wal.flush()
        self._writes.clear()
        self._status = TxnStatus.ABORTED
