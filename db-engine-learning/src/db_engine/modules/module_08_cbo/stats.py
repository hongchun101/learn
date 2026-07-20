"""Table-level + column-level statistics.

The CBO reads these to estimate cardinalities and choose plans.
The structure is deliberately small — chapter 08 ships the
constants; production engines use HyperLogLog for distinct counts
(chapter 14) and reservoir sampling for selectivity.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class ColumnStats:
    column: str
    distinct: int
    nulls: int
    min: int | str | None
    max: int | str | None


@dataclass(slots=True)
class TableStats:
    table: str
    rows: int
    columns: dict[str, ColumnStats] = field(default_factory=dict)

    @classmethod
    def from_table(cls, table, sample: int | None = None) -> "TableStats":
        """Build stats from an in-memory `Table`. For 1000+ rows,
        sample 10% and scale."""
        rows = table.rows
        n = len(rows)
        use_sample = sample is not None and sample < n
        if use_sample:
            every = max(1, n // sample)
            sampled = rows[::every]
        else:
            sampled = rows
        out = cls(table=table.name, rows=n)
        for col in table.schema.columns:
            values = [r.get(col.name) for r in sampled]
            nulls = sum(1 for v in values if v is None)
            distinct_values = {v for v in values if v is not None}
            if values and not all(v is None for v in values):
                mins = min(v for v in values if v is not None)
                maxs = max(v for v in values if v is not None)
            else:
                mins = None
                maxs = None
            out.columns[col.name] = ColumnStats(
                column=col.name,
                distinct=len(distinct_values),
                nulls=nulls,
                min=mins,
                max=maxs,
            )
        if use_sample:
            # Scale distinct/nulls from sample to total.
            for col, cs in out.columns.items():
                cs.distinct = min(cs.distinct * (n / len(sampled)), n)
        return out


@dataclass(slots=True)
class ScanStats:
    """The result of statistics-pushed selection through an
    expression. The CBO reads this to plan joins."""

    rows: int
    distinct_columns: dict[str, int] = field(default_factory=dict)


__all__ = ["TableStats", "ColumnStats", "ScanStats"]
