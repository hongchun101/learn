"""Chapter 3: the unified :mod:`concurrent.futures` task API."""

from collections.abc import Callable, Iterable
from concurrent.futures import (
    ALL_COMPLETED,
    Future,
    ProcessPoolExecutor,
    ThreadPoolExecutor,
    as_completed,
    wait,
)
from dataclasses import dataclass
from threading import Event, Lock


@dataclass(frozen=True)
class FuturesReport:
    """Summarize ordering and notification behavior of futures."""

    input_order: tuple[int, ...]
    completion_order: tuple[int, ...]
    callback_results: tuple[int, ...]
    process_results: tuple[int, ...]


def cube(value: int) -> int:
    """Return a cube from an importable process-worker function."""
    return value**3


def map_with_threads(
    function: Callable[[int], int], values: Iterable[int], max_workers: int = 4
) -> list[int]:
    """Apply ``function`` in a thread pool while retaining input order."""
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        return list(executor.map(function, values))


def map_with_processes(values: Iterable[int], max_workers: int = 2) -> list[int]:
    """Cube values in a process pool while retaining input order."""
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        return list(executor.map(cube, values))


def run_futures_tour() -> FuturesReport:
    """Exercise executors, ``as_completed``, ``wait``, and callbacks."""
    release: dict[int, Event] = {value: Event() for value in (1, 2, 3)}
    started: dict[int, Event] = {value: Event() for value in (1, 2, 3)}

    def controlled(value: int) -> int:
        started[value].set()
        release[value].wait()
        return value

    callback_results: list[int] = []
    callback_lock = Lock()
    callbacks_done = Event()

    def record(future: Future[int]) -> None:
        result = future.result()
        with callback_lock:
            callback_results.append(result)
            if len(callback_results) == 3:
                callbacks_done.set()

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(controlled, value) for value in (1, 2, 3)]
        for future in futures:
            future.add_done_callback(record)
        for event in started.values():
            event.wait()
        for value in (3, 2, 1):
            release[value].set()
            futures[value - 1].result()
        done, pending = wait(futures, return_when=ALL_COMPLETED)
        if pending or len(done) != 3:
            raise RuntimeError("wait did not observe all futures")
        completion_order = tuple(future.result() for future in as_completed(futures))
        callbacks_done.wait()
        input_order = tuple(future.result() for future in futures)

    return FuturesReport(
        input_order=input_order,
        completion_order=completion_order,
        callback_results=tuple(callback_results),
        process_results=tuple(map_with_processes((1, 2, 3), max_workers=2)),
    )
