"""Catalog + tiny in-memory row store.

A simple, table-by-name registry of schemas and rows. The executor
chapter uses this to drive tests; later chapters plug in MVCC or
columnar storage on top of the same surface.
"""
from __future__ import annotations

from typing import Iterable

from db_engine.shared.types import Column, Row, RowId, Schema, SqlType, Value


class Table:
    """A schema + a list of rows (each row keyed by column name)."""

    __slots__ = ("name", "schema", "rows", "_auto_pk")

    def __init__(self, name: str, schema: Schema) -> None:
        self.name = name
        self.schema = schema
        self.rows: list[dict[str, Value]] = []
        self._auto_pk = 0

    def insert(self, values: dict[str, Value] | list[Value]) -> Row:
        if isinstance(values, list):
            if len(values) != len(self.schema.columns):
                raise ValueError(f"expected {len(self.schema.columns)} values, got {len(values)}")
            values = {c.name: v for c, v in zip(self.schema.columns, values, strict=True)}
        # Validate every column.
        for col in self.schema.columns:
            if col.name not in values:
                if col.nullable:
                    values[col.name] = None
                else:
                    raise ValueError(f"missing column {col.name}")
            col.validate_value(values[col.name])
        self.rows.append(values)
        rid = RowId(page_id=0, slot_id=len(self.rows) - 1)
        return Row(rid=rid, values=[values[c.name] for c in self.schema.columns])

    def all_rows(self) -> Iterable[Row]:
        for i, r in enumerate(self.rows):
            yield Row(rid=RowId(page_id=0, slot_id=i), values=[r[c.name] for c in self.schema.columns])


class Catalog:
    """Tables by name."""

    def __init__(self) -> None:
        self._tables: dict[str, Table] = {}

    def create_table(self, name: str, schema: Schema) -> Table:
        if name in self._tables:
            raise ValueError(f"table {name!r} already exists")
        t = Table(name, schema)
        self._tables[name] = t
        return t

    def get(self, name: str) -> Table:
        return self._tables[name]

    def has(self, name: str) -> bool:
        return name in self._tables

    def schemas(self) -> dict[str, Schema]:
        return {n: t.schema for n, t in self._tables.items()}


__all__ = ["Catalog", "Table"]
