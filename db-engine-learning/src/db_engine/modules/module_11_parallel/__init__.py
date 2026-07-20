"""Module 11 — parallel execution, exchange, morsel-driven scheduling.

Key abstractions:
- `Exchange`: an operator that ships rows between workers.
- `Morsel`: a chunk of work, sized by rows × workers.
- `ParallelExecutor`: a thread-pool driver that pulls morsels.

The curriculum uses `threading` (not multiprocessing) to keep test
fixtures clean; the same code structure scales to `multiprocessing`
or `asyncio`.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from db_engine.shared.types import Row


def in_chunks(rows: list[Row], n: int) -> list[list[Row]]:
    return [rows[i : i + n] for i in range(0, len(rows), n)]


def parallel_map(rows: list[Row], fn: Callable[[Row], Row], workers: int = 4) -> list[Row]:
    """Map `fn` across rows in parallel; preserve input order."""
    chunks = in_chunks(rows, max(1, len(rows) // workers))
    out: list[Row] = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for chunk_result in ex.map(lambda c: [fn(r) for r in c], chunks):
            out.extend(chunk_result)
    return out


class Exchange:
    """A producer/consumer exchange — rows from N producers to M consumers."""

    __slots__ = ("_buffer", "_done")

    def __init__(self) -> None:
        from queue import SimpleQueue
        self._q = SimpleQueue()
        self._done = False

    def send(self, row: Row) -> None:
        self._q.put(row)

    def close(self) -> None:
        self._q.put(None)

    def drain(self) -> list[Row]:
        out: list[Row] = []
        while True:
            r = self._q.get()
            if r is None:
                return out
            out.append(r)


def run_demo() -> dict:
    rows = [Row(rid=None, values=[i, i * 2]) for i in range(1000)]
    out = parallel_map(rows, lambda r: Row(rid=r.rid, values=[r.values[0], r.values[1] + 1]), workers=4)
    return {"n_input": len(rows), "n_output": len(out), "first_value": out[0].values}


__all__ = ["Exchange", "parallel_map", "run_demo"]
