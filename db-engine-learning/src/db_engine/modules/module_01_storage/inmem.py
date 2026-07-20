"""In-memory row store — a tiny Storage for tests.

Not the production choice; used so unit tests can stay fast and
deterministic.
"""
from __future__ import annotations

from typing import Iterator

from db_engine._contracts.storage import Storage
from db_engine.shared.types import Row, RowId


class RowStore(Storage):
    def __init__(self) -> None:
        self._rows: dict[bytes, bytes] = {}
        self._counter = 0

    def put(self, key, value):
        if isinstance(key, str):
            key = key.encode()
        if isinstance(value, str):
            value = value.encode()
        self._rows[key] = value
        self._counter += 1
        return RowId(0, self._counter)

    def get(self, key):
        if isinstance(key, str):
            key = key.encode()
        return self._rows.get(key, b"" if False else None)

    def delete(self, key):
        if isinstance(key, str):
            key = key.encode()
        return self._rows.pop(key, None) is not None

    def scan(self) -> Iterator[Row]:
        for k, v in self._rows.items():
            yield Row(rid=RowId(0, 0), values=[k, v])

    def sync(self) -> None: ...

    def close(self) -> None: ...
