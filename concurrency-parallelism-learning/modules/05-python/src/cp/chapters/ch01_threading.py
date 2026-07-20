"""Chapter 1: shared-memory concurrency with :mod:`threading`."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from threading import (
    Barrier,
    BoundedSemaphore,
    Condition,
    Event,
    Lock,
    RLock,
    Semaphore,
    Thread,
    Timer,
    local,
)
from typing import Any


@dataclass(frozen=True)
class ThreadingReport:
    """Summarize the effects observed in the threading primitive tour."""

    counter: int
    recursive_depth: int
    semaphore_peak: int
    timer_fired: bool
    barrier_indices: tuple[int, ...]
    local_values: tuple[str, ...]


def locked_sum(values: Iterable[int]) -> int:
    """Sum values from worker threads while protecting the shared accumulator."""
    lock = Lock()
    total = 0

    def add(value: int) -> None:
        nonlocal total
        with lock:
            total += value

    threads = [Thread(target=add, args=(value,)) for value in values]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return total


def wait_for_predicate(condition: Condition, predicate: Callable[[], bool]) -> None:
    """Wait under a condition lock until ``predicate`` becomes true."""
    with condition:
        condition.wait_for(predicate)


def run_threading_tour() -> ThreadingReport:
    """Exercise the standard threading coordination primitives safely."""
    start = Event()
    changed = Condition()
    state = {"counter": 0}

    def increment() -> None:
        start.wait()
        with changed:
            state["counter"] += 1
            changed.notify_all()

    workers = [Thread(target=increment) for _ in range(4)]
    for worker in workers:
        worker.start()
    start.set()
    with changed:
        changed.wait_for(lambda: state["counter"] == len(workers))
    for worker in workers:
        worker.join()

    recursive = RLock()

    def descend(depth: int) -> int:
        with recursive:
            return depth if depth == 0 else 1 + descend(depth - 1)

    permits = Semaphore(2)
    bounded = BoundedSemaphore(2)
    activity_lock = Lock()
    peak = {"active": 0, "maximum": 0}
    all_inside = Event()
    release = Event()

    def limited() -> None:
        with permits, bounded:
            with activity_lock:
                peak["active"] += 1
                peak["maximum"] = max(peak["maximum"], peak["active"])
                if peak["active"] == 2:
                    all_inside.set()
            release.wait()
            with activity_lock:
                peak["active"] -= 1

    limited_workers = [Thread(target=limited) for _ in range(3)]
    for worker in limited_workers:
        worker.start()
    all_inside.wait()
    release.set()
    for worker in limited_workers:
        worker.join()

    timer_fired = Event()
    timer = Timer(0.001, timer_fired.set)
    timer.start()
    timer.join()

    rendezvous = Barrier(3)
    barrier_indices: list[int] = []
    index_lock = Lock()

    def meet() -> None:
        index = rendezvous.wait()
        with index_lock:
            barrier_indices.append(index)

    parties = [Thread(target=meet) for _ in range(3)]
    for party in parties:
        party.start()
    for party in parties:
        party.join()

    storage = local()
    local_values: list[str] = []
    local_lock = Lock()

    def remember(value: str) -> None:
        storage.value = value
        with local_lock:
            local_values.append(storage.value)

    locals_threads = [Thread(target=remember, args=(value,)) for value in ("alpha", "beta")]
    for thread in locals_threads:
        thread.start()
    for thread in locals_threads:
        thread.join()

    return ThreadingReport(
        counter=state["counter"],
        recursive_depth=descend(3),
        semaphore_peak=peak["maximum"],
        timer_fired=timer_fired.is_set(),
        barrier_indices=tuple(sorted(barrier_indices)),
        local_values=tuple(sorted(local_values)),
    )


def match_thread_state(report: ThreadingReport) -> str:
    """Classify a tour result using structural pattern matching."""
    match report:
        case ThreadingReport(counter=4, semaphore_peak=peak) if peak <= 2:
            return "coordinated"
        case ThreadingReport():
            return "unexpected"
        case _:
            return "invalid"


def thread_local_value(storage: local, default: Any = None) -> Any:
    """Read a thread-local ``value`` without leaking another thread's state."""
    return getattr(storage, "value", default)
