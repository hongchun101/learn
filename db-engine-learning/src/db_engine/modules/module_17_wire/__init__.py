"""Module 17 — wire protocol.

A frame is `[4 byte length][1 byte type][length bytes payload]`.
The protocol is symmetric: client and server each use `Wire.send_frame`
/ `Wire.recv_frame`. The capstone wires up a server that listens
on this protocol.
"""
from __future__ import annotations

import io
import socket
import threading
from dataclasses import dataclass
from typing import Callable

from db_engine._contracts.wire import Frame, FrameType


def pack_frame(frame: Frame) -> bytes:
    """Encode a frame as bytes (length-prefixed)."""
    inner = bytes([frame.type]) + frame.payload
    return len(inner).to_bytes(4, "big") + inner


def unpack_frame(buf: bytes) -> tuple[Frame, bytes]:
    """Decode one frame; return the frame and the leftover."""
    if len(buf) < 4:
        raise ValueError("incomplete header")
    length = int.from_bytes(buf[:4], "big")
    if len(buf) < 4 + length:
        raise ValueError("incomplete body")
    body = buf[4 : 4 + length]
    type_, payload = body[0], body[1:]
    return Frame(type=FrameType(type_), payload=bytes(payload)), buf[4 + length :]


class Wire:
    def __init__(self, sink: io.BytesIO | socket.socket | None = None) -> None:
        self._sink = sink if sink is not None else io.BytesIO()
        self._buffer = io.BytesIO()
        self._read_pos = 0

    def send_frame(self, frame: Frame) -> None:
        self._sink.send(pack_frame(frame)) if hasattr(self._sink, "send") else self._sink.write(pack_frame(frame))

    def recv_frame(self) -> Frame | None:
        if isinstance(self._sink, io.BytesIO):
            data_len = len(self._sink.getvalue())
            pos = self._read_pos
            if pos + 4 > data_len:
                return None
            self._sink.seek(pos)
            head = self._sink.read(4)
            length = int.from_bytes(head, "big")
            if pos + 4 + length > data_len:
                return None
            self._sink.seek(pos + 4)
            body = self._sink.read(length)
            self._read_pos = pos + 4 + length
            return Frame(type=FrameType(body[0]), payload=bytes(body[1:]))
        # Real socket.
        header = self._recv_exact(4)
        if not header:
            return None
        length = int.from_bytes(header, "big")
        body = self._recv_exact(length)
        return Frame(type=FrameType(body[0]), payload=bytes(body[1:]))

    def _recv_exact(self, n: int) -> bytes:
        out = bytearray()
        while len(out) < n:
            chunk = self._sink.recv(n - len(out))  # type: ignore[attr-defined]
            if not chunk:
                return bytes(out)
            out.extend(chunk)
        return bytes(out)

    def close(self) -> None:
        if hasattr(self._sink, "close"):
            try:
                self._sink.close()
            except Exception:
                pass


@dataclass
class TcpServer:
    """A toy TCP server that accepts a single connection."""

    host: str
    port: int
    handler: Callable[[Wire], None]

    def serve(self) -> None:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((self.host, self.port))
        s.listen(1)
        conn, _ = s.accept()
        try:
            self.handler(Wire(conn))
        finally:
            conn.close()
            s.close()


def run_demo() -> dict:
    buf = io.BytesIO()
    w = Wire(buf)
    w.send_frame(Frame(type=FrameType.HELLO, payload=b"hi"))
    w.send_frame(Frame(type=FrameType.ROW, payload=b"a"))
    # Read the two frames back.
    r1 = w.recv_frame()
    r2 = w.recv_frame()
    return {
        "frame1": r1.type.name if r1 else None,
        "frame2": r2.type.name if r2 else None,
    }


__all__ = ["Frame", "FrameType", "Wire", "TcpServer", "pack_frame", "unpack_frame", "run_demo"]
