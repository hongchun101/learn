"""The Executor contract — Chapter 06 introduces it.

An `Executor` accepts an operator tree, opens it, and pulls rows on
demand. Volcano (iterator) model: `next()` returns the next row or
None at end-of-stream.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterator

from db_engine._contracts.plan import Operator
from db_engine.shared.types import Row


class Executor(ABC):
    """Open an operator tree and pull rows.

    Contract:
      - `open(root)` initialises the tree.
      - `next()` returns the next row, or None at end-of-stream.
      - `close()` releases resources.
      - Row order is implementation-defined but stable across runs
        given identical data (the planner/optimizer + storage
        produce stable row order).
    """

    @abstractmethod
    def open(self, root: Operator) -> None: ...

    @abstractmethod
    def next(self) -> Row | None: ...

    @abstractmethod
    def close(self) -> None: ...

    def run(self, root: Operator) -> Iterator[Row]:
        """Convenience: open → pull until EOS → close."""
        self.open(root)
        try:
            while True:
                row = self.next()
                if row is None:
                    return
                yield row
        finally:
            self.close()
