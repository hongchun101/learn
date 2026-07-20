"""Concrete shared types.

The contract that every chapter depends on.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Hashable, Sequence


# ---------------------------------------------------------------------------
# Identifiers and primitives
# ---------------------------------------------------------------------------

type PageId = int
"""Disk-stable page identifier. Monotonically allocated by the storage layer."""

type Lsn = int
"""Log sequence number. Strictly monotonic per storage instance."""

type TxnId = int
"""Identifier of an in-flight or finished transaction."""

type Ts = int
"""Hybrid timestamp: monotonic, microsecond resolution, fits in 8 bytes."""


class SqlType(str, Enum):
    """The four SQL value types we support throughout the curriculum."""

    INT = "INT"
    BIGINT = "BIGINT"
    TEXT = "TEXT"
    BOOL = "BOOL"

    @classmethod
    def of(cls, value: "Value") -> "SqlType":
        if isinstance(value, bool):
            return cls.BOOL
        if isinstance(value, int):
            return cls.BIGINT if abs(value).bit_length() > 32 else cls.INT
        if isinstance(value, str):
            return cls.TEXT
        if value is None:
            raise TypeError("cannot infer type of None")
        raise TypeError(f"unsupported value type: {type(value)!r}")


type Value = int | str | bool | None


# ---------------------------------------------------------------------------
# Page-level types
# ---------------------------------------------------------------------------

@dataclass(slots=True, frozen=True)
class RowId:
    """A stable on-disk row handle: (page_id, slot_id)."""

    page_id: PageId
    slot_id: int

    def __str__(self) -> str:
        return f"({self.page_id}:{self.slot_id})"


@dataclass(slots=True)
class Page:
    """A 4 KiB page of raw bytes plus its parsed row slots.

    The chapter 01 slotted-page layout places rows contiguously from the
    end of the page and a slot array at the head. Other chapters reuse
    Page for things like a hash-bucket or a sort-run — they operate on
    `data` directly.
    """

    page_id: PageId
    data: bytearray = field(default_factory=lambda: bytearray(4096))
    rows: list[RowId] = field(default_factory=list)
    checksum: int = 0


# ---------------------------------------------------------------------------
# Table-level types
# ---------------------------------------------------------------------------

@dataclass(slots=True, frozen=True)
class Column:
    name: str
    sql_type: SqlType
    nullable: bool = True

    def validate_value(self, value: "Value") -> "Value":
        if value is None:
            if not self.nullable:
                raise ValueError(f"column {self.name!r} is not nullable")
            return None
        actual = SqlType.of(value)
        if actual is not self.sql_type:
            if not (self.sql_type is SqlType.BIGINT and actual is SqlType.INT):
                raise TypeError(
                    f"column {self.name!r} expects {self.sql_type}, got {actual}"
                )
        return value


type RowValues = list[Value]
type RowDict = dict[str, Value]


@dataclass(slots=True, frozen=True)
class Schema:
    """A table schema, indexed by column name and by position."""

    columns: tuple[Column, ...]

    def __post_init__(self) -> None:
        names = [c.name for c in self.columns]
        if len(names) != len(set(names)):
            raise ValueError("duplicate column names in schema")

    def index(self, name: str) -> int:
        for i, c in enumerate(self.columns):
            if c.name == name:
                return i
        raise KeyError(name)

    def has(self, name: str) -> bool:
        return any(c.name == name for c in self.columns)

    def get(self, name: str) -> Column:
        for c in self.columns:
            if c.name == name:
                return c
        raise KeyError(name)

    def __getitem__(self, key: str | int) -> Column | Value:
        if isinstance(key, int):
            return self.columns[key]
        return self.get(key)

    def to_row(self, values: RowValues | RowDict) -> RowValues:
        if isinstance(values, dict):
            return [self[c.name].validate_value(values[c.name]) for c in self.columns]
        if len(values) != len(self.columns):
            raise ValueError(
                f"expected {len(self.columns)} values, got {len(values)}"
            )
        return [c.validate_value(v) for c, v in zip(self.columns, values, strict=True)]

    def project_schema(self, columns: Sequence[str]) -> "Schema":
        cols = tuple(self[c] for c in columns)
        return Schema(cols)


@dataclass(slots=True, frozen=True)
class Row:
    """A row carrying its values and an optional row id."""

    rid: RowId | None
    values: RowValues

    def __getitem__(self, idx_or_name: int | str) -> Value:
        if isinstance(idx_or_name, int):
            return self.values[idx_or_name]
        raise TypeError("Row only supports integer indexing")

    def to_mapping(self, schema: Schema) -> RowDict:
        return {c.name: v for c, v in zip(schema.columns, self.values, strict=True)}


# ---------------------------------------------------------------------------
# Any exports
# ---------------------------------------------------------------------------

__all__ = [
    "PageId",
    "Lsn",
    "TxnId",
    "Ts",
    "Value",
    "SqlType",
    "RowId",
    "Page",
    "Column",
    "RowValues",
    "RowDict",
    "Schema",
    "Row",
]
