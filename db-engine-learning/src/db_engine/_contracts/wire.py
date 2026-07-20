"""The Wire contract — Chapter 17 introduces it.

`Wire` is the byte-level protocol used by clients to talk to the
engine. The contract is intentionally minimal: a length-prefixed
frame of a type tag and a payload (bytes).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import IntEnum


class FrameType(IntEnum):
    """Tags for the wire protocol."""

    HELLO = 1
    QUERY = 2
    INSERT = 3
    CREATE_TABLE = 4
    ROWS = 10
    ROW = 11
    EOS = 12
    ERROR = 20
    BYE = 99


@dataclass(slots=True, frozen=True)
class Frame:
    type: FrameType
    payload: bytes


class Wire(ABC):
    """Send / receive length-prefixed frames.

    Wire format (per frame):
        [4 bytes big-endian length] [1 byte type] [length bytes payload]

    Contract:
      - `send_frame(frame)` persists to the sink before returning.
      - `recv_frame()` parses one frame or raises on EOF.
      - Any error mid-frame is reported via FrameType.ERROR.
    """

    @abstractmethod
    def send_frame(self, frame: Frame) -> None: ...

    @abstractmethod
    def recv_frame(self) -> Frame | None: ...

    @abstractmethod
    def close(self) -> None: ...
