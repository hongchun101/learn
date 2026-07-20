"""Log record format.

A single record is:

    [4 B length] [4 B kind] [8 B txn_id] [4 B key_len] [key] [4 B val_len] [val]

Tombstones: `val_len == -1` ⇒ key is deleted.

`kind` ∈ {BEGIN=1, COMMIT=2, ABORT=3, UPDATE=4, CHECKPOINT=5}.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass
from enum import IntEnum


class LogKind(IntEnum):
    BEGIN = 1
    COMMIT = 2
    ABORT = 3
    UPDATE = 4
    CHECKPOINT = 5


_HEADER_FMT = "<IiII"
_HEADER_SIZE = struct.calcsize(_HEADER_FMT)
_VAL_LEN_TOMBSTONE = -1


@dataclass(slots=True, frozen=True)
class LogRecord:
    kind: LogKind
    txn_id: int
    key: bytes | None = None
    value: bytes | None = None

    def encode(self) -> bytes:
        if self.kind in (LogKind.UPDATE,):
            assert self.key is not None
            val_len = _VAL_LEN_TOMBSTONE if self.value is None else len(self.value)
            payload = struct.pack(
                _HEADER_FMT,
                0,
                int(self.kind),
                self.txn_id,
                len(self.key),
            ) + self.key + struct.pack("<i", val_len) + (self.value or b"")
        else:
            payload = struct.pack(
                _HEADER_FMT,
                0,
                int(self.kind),
                self.txn_id,
                0,
            )
        # Prefix with length (excluding the prefix itself).
        return struct.pack("<I", len(payload)) + payload

    @classmethod
    def decode(cls, data: bytes) -> "LogRecord":
        if len(data) < 4:
            raise ValueError("truncated")
        length = struct.unpack("<I", data[:4])[0]
        body = data[4 : 4 + length]
        if len(body) < _HEADER_SIZE:
            raise ValueError("truncated body")
        _pad, kind, txn_id, key_len = struct.unpack_from(_HEADER_FMT, body, 0)
        kind = LogKind(kind)
        off = _HEADER_SIZE
        if key_len:
            key = body[off : off + key_len]
            off += key_len
        else:
            key = None
        if kind is LogKind.UPDATE:
            val_len = struct.unpack_from("<i", body, off)[0]
            off += 4
            value = None if val_len == _VAL_LEN_TOMBSTONE else body[off : off + val_len]
        else:
            value = None
        return cls(kind=kind, txn_id=txn_id, key=key, value=value)
