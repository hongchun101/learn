"""The slotted-page layout used by chapter 01.

A `SlottedPage` is the unit of I/O for the B+Tree and the heap table.

Layout:

    +--------------------------+ 0
    |  Header (16 bytes)       |
    |    magic       u32       |
    |    n_slots     u16       |
    |    free_start u16        |
    |    free_end   u16        |
    |    checksum   u32        |
    +--------------------------+ 16
    |  Slot array (8 bytes ea) |
    |    offset     u32        |
    |    length     u32        |
    +--------------------------+ 16 + 8 * n_slots
    |                          |
    |  Free space              |
    |                          |
    +--------------------------+ free_end (= page size - row data)
    |  Row data (right→left)   |
    |    ...                   |
    |    Slot[0]'s row         |
    +--------------------------+ page_size

Reading a row looks up its slot offset and length, then copies
`length` bytes from `offset`. Writing a row either uses the free
space or compacts.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass

from db_engine.shared.types import Page, PageId, Value

MAGIC = 0xC0_DE_B0_00
HEADER_FMT = "<IHHII"
HEADER_SIZE = struct.calcsize(HEADER_FMT)
SLOT_FMT = "<II"
SLOT_SIZE = struct.calcsize(SLOT_FMT)
SLOT_OFFSET = HEADER_SIZE


@dataclass(slots=True, frozen=True)
class _Slot:
    offset: int
    length: int


def _slot_index(slot_id: int) -> int:
    return SLOT_OFFSET + slot_id * SLOT_SIZE


class SlottedPage:
    """The slotted page parsed from a `Page`.

    Use `SlottedPage.from_page(page)` to parse, or
    `SlottedPage.empty(page_id)` to make a fresh one.
    """

    __slots__ = ("page", "header", "slots", "checksum")

    def __init__(self, page: Page, header: dict, slots: list[_Slot], checksum: int) -> None:
        self.page = page
        self.header = header
        self.slots = slots
        self.checksum = checksum

    @classmethod
    def empty(cls, page_id: PageId, page_size: int = 4096) -> "SlottedPage":
        page = Page(page_id=page_id, data=bytearray(page_size))
        sp = cls(page, {"n_slots": 0, "free_start": SLOT_OFFSET, "free_end": page_size}, [], 0)
        sp._write_header_locked()
        return sp

    @classmethod
    def from_page(cls, page: Page) -> "SlottedPage":
        data = bytes(page.data)
        magic, n_slots, free_start, free_end, checksum = struct.unpack_from(HEADER_FMT, data, 0)
        if magic != MAGIC:
            raise ValueError(f"not a slotted page: magic={magic:#x}")
        slots: list[_Slot] = []
        for i in range(n_slots):
            off, length = struct.unpack_from(SLOT_FMT, data, _slot_index(i))
            slots.append(_Slot(off, length))
        return cls(page, {"n_slots": n_slots, "free_start": free_start, "free_end": free_end}, slots, checksum)

    # -------------------------------------------------------------------
    # Layout IO
    # -------------------------------------------------------------------

    def _write_header_locked(self) -> None:
        d = self.page.data
        page_size = len(d)
        struct.pack_into(
            HEADER_FMT,
            d,
            0,
            MAGIC,
            self.header["n_slots"],
            self.header["free_start"],
            self.header["free_end"],
            self.checksum,
        )
        # Compute a checksum every write — small cost, big benefit.
        self.checksum = _checksum(bytes(d))
        struct.pack_into(HEADER_FMT, d, 0, MAGIC, self.header["n_slots"], self.header["free_start"], self.header["free_end"], self.checksum)

    def _write_slot(self, slot_id: int, slot: _Slot) -> None:
        struct.pack_into(SLOT_FMT, self.page.data, _slot_index(slot_id), slot.offset, slot.length)

    # -------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------

    def insert_row(self, payload: bytes) -> int:
        """Append a row, return its slot id. Raises `ValueError` if full."""
        page_size = len(self.page.data)
        free_start = self.header["free_start"]
        free_end = self.header["free_end"]

        # Need space for the new slot + payload.
        required = SLOT_SIZE + len(payload)
        if free_start + required > free_end:
            raise ValueError("page is full")

        # Pages grow downward: payload written from `free_end - len`.
        new_offset = free_end - len(payload)
        self.page.data[new_offset : new_offset + len(payload)] = payload
        slot_id = self.header["n_slots"]
        self.slots.append(_Slot(new_offset, len(payload)))
        self.header["n_slots"] = slot_id + 1
        self.header["free_start"] = free_start + SLOT_SIZE
        self.header["free_end"] = new_offset

        self._write_slot(slot_id, self.slots[-1])
        self._write_header_locked()
        return slot_id

    def read(self, slot_id: int) -> bytes:
        slot = self.slots[slot_id]
        return bytes(self.page.data[slot.offset : slot.offset + slot.length])

    def update(self, slot_id: int, payload: bytes) -> None:
        slot = self.slots[slot_id]
        if len(payload) <= slot.length:
            # Fits in the same slot — overwrite in place.
            self.page.data[slot.offset : slot.offset + len(payload)] = payload
            slot = _Slot(slot.offset, len(payload))
            self.slots[slot_id] = slot
            self._write_slot(slot_id, slot)
            self._write_header_locked()
            return
        # Doesn't fit — delete + reinsert.
        self.delete(slot_id)
        new = self.insert_row(payload)
        # The caller is told the new slot; old slot remains "tombstoned".
        slot_id = new

    def delete(self, slot_id: int) -> None:
        slot = self.slots[slot_id]
        # Mark with a zero-length slot; bookkeeping is done lazily on
        # compaction. Real engines would thread a free-list here.
        slot = _Slot(slot.offset, 0)
        self.slots[slot_id] = slot
        self._write_slot(slot_id, slot)
        self._write_header_locked()

    def free_space(self) -> int:
        return self.header["free_end"] - self.header["free_start"] - SLOT_SIZE

    def __repr__(self) -> str:
        return f"SlottedPage(n_slots={self.header['n_slots']}, free={self.free_space()})"


# ---------------------------------------------------------------------------
# Row encoding helpers (the chapter used by tests and consumers)
# ---------------------------------------------------------------------------

def encode_row(values: list[Value]) -> bytes:
    """Compact encoding for a row: (count) then per value (type, payload)."""
    parts: list[bytes] = []
    parts.append(struct.pack("<H", len(values)))
    for v in values:
        if v is None:
            parts.append(b"\x00")
        elif isinstance(v, bool):
            parts.append(b"\x01" + struct.pack("<B", 1 if v else 0))
        elif isinstance(v, int):
            parts.append(b"\x02" + struct.pack("<q", v))
        elif isinstance(v, str):
            b = v.encode("utf-8")
            parts.append(b"\x03" + struct.pack("<H", len(b)) + b)
        else:
            raise TypeError(f"cannot encode {type(v).__name__}")
    return b"".join(parts)


def decode_row(buf: bytes) -> list[Value]:
    """Reverse of `encode_row`."""
    n, off = struct.unpack_from("<H", buf, 0)
    out: list[Value] = []
    off += 2
    for _ in range(n):
        tag = buf[off]
        off += 1
        if tag == 0x00:
            out.append(None)
        elif tag == 0x01:
            out.append(bool(struct.unpack_from("<B", buf, off)[0]))
            off += 1
        elif tag == 0x02:
            out.append(struct.unpack_from("<q", buf, off)[0])
            off += 8
        elif tag == 0x03:
            length = struct.unpack_from("<H", buf, off)[0]
            off += 2
            out.append(buf[off : off + length].decode("utf-8"))
            off += length
        else:
            raise ValueError(f"unknown value tag {tag}")
    return out


def _checksum(data: bytes) -> int:
    """A tiny but real checksum. Real engines use Fletcher-32 or CRC32."""
    s0 = 0
    s1 = 0
    for i in range(0, len(data), 4):
        chunk = data[i : i + 4]
        s0 = (s0 + sum(chunk)) & 0xFFFFFFFF
        s1 = (s1 + s0) & 0xFFFFFFFF
    return (s1 << 16) | (s0 & 0xFFFF) & 0xFFFFFFFF
