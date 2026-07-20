"""Chapter 5: measure the conventional CPython GIL and process parallelism."""

import ctypes
import os
import sys
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass
from statistics import median
from time import perf_counter
from types import TracebackType
from typing import cast

PEP_703_NOTE = (
    "PEP 703 makes the GIL optional in free-threaded CPython builds (3.13t and later); "
    "extension compatibility and shared-state synchronization still require auditing."
)


@dataclass(frozen=True)
class TimedRun:
    """Capture elapsed duration, worker identities, and deterministic results."""

    seconds: float
    worker_pids: tuple[int, ...]
    checksums: tuple[int, ...]


@dataclass(frozen=True)
class GilMeasurement:
    """Compare sequential, threaded, and process execution of one CPU kernel."""

    iterations_per_task: int
    tasks: int
    switch_interval_seconds: float
    sequential: TimedRun
    threads: TimedRun
    processes: TimedRun

    @property
    def thread_speedup(self) -> float:
        """Return sequential elapsed time divided by threaded elapsed time."""
        return self.sequential.seconds / self.threads.seconds

    @property
    def process_speedup(self) -> float:
        """Return sequential elapsed time divided by process elapsed time."""
        return self.sequential.seconds / self.processes.seconds


def cpu_bound_kernel(iterations: int) -> tuple[int, int]:
    """Run deterministic pure-Python integer work and return PID plus checksum."""
    accumulator = 0x345678
    for index in range(iterations):
        accumulator = (accumulator * 1_000_003) ^ index
        accumulator &= 0xFFFFFFFF
    return os.getpid(), accumulator


def _time_sequential(iterations: int, tasks: int) -> TimedRun:
    started = perf_counter()
    results = tuple(cpu_bound_kernel(iterations) for _ in range(tasks))
    elapsed = perf_counter() - started
    return TimedRun(
        seconds=elapsed,
        worker_pids=tuple(pid for pid, _ in results),
        checksums=tuple(checksum for _, checksum in results),
    )


def _time_threads(iterations: int, tasks: int) -> TimedRun:
    started = perf_counter()
    with ThreadPoolExecutor(max_workers=tasks) as executor:
        results = tuple(executor.map(cpu_bound_kernel, (iterations,) * tasks))
    elapsed = perf_counter() - started
    return TimedRun(
        seconds=elapsed,
        worker_pids=tuple(pid for pid, _ in results),
        checksums=tuple(checksum for _, checksum in results),
    )


def _time_processes(iterations: int, tasks: int) -> TimedRun:
    with ProcessPoolExecutor(max_workers=tasks) as executor:
        tuple(executor.map(cpu_bound_kernel, (1,) * tasks))
        started = perf_counter()
        results = tuple(executor.map(cpu_bound_kernel, (iterations,) * tasks))
        elapsed = perf_counter() - started
    return TimedRun(
        seconds=elapsed,
        worker_pids=tuple(pid for pid, _ in results),
        checksums=tuple(checksum for _, checksum in results),
    )


def measure_gil(iterations_per_task: int = 3_000_000, tasks: int = 2) -> GilMeasurement:
    """Measure pure-Python CPU work sequentially, in threads, and in processes.

    A conventional GIL build serializes Python bytecode across the worker threads,
    whereas process workers own independent interpreters and GILs. The process pool
    is warmed before timing to exclude most startup cost.
    """
    if iterations_per_task < 1:
        raise ValueError("iterations_per_task must be positive")
    if tasks < 2:
        raise ValueError("tasks must be at least two")

    sequential_samples = [_time_sequential(iterations_per_task, tasks) for _ in range(2)]
    thread_samples = [_time_threads(iterations_per_task, tasks) for _ in range(2)]
    process_samples = [_time_processes(iterations_per_task, tasks) for _ in range(2)]

    def middle(samples: list[TimedRun]) -> TimedRun:
        target = median(sample.seconds for sample in samples)
        return min(samples, key=lambda sample: abs(sample.seconds - target))

    return GilMeasurement(
        iterations_per_task=iterations_per_task,
        tasks=tasks,
        switch_interval_seconds=sys.getswitchinterval(),
        sequential=middle(sequential_samples),
        threads=middle(thread_samples),
        processes=middle(process_samples),
    )


def inject_async_exception(
    thread_id: int, exception_type: type[BaseException]
) -> bool:
    """Inject an exception into a CPython thread for emergency demonstration only.

    This CPython-specific API can interrupt code while invariants are temporarily
    broken. It is not safe cancellation; production code should signal an Event.
    """
    pythonapi = ctypes.pythonapi
    setter = pythonapi.PyThreadState_SetAsyncExc
    setter.argtypes = (ctypes.c_ulong, ctypes.py_object)
    setter.restype = ctypes.c_int
    affected = cast(int, setter(ctypes.c_ulong(thread_id), ctypes.py_object(exception_type)))
    if affected > 1:
        setter(ctypes.c_ulong(thread_id), None)
        raise RuntimeError("PyThreadState_SetAsyncExc affected multiple thread states")
    return affected == 1


def free_threading_note() -> str:
    """Return the adoption warning for PEP 703 free-threaded CPython."""
    return PEP_703_NOTE


def format_exception_context(
    exception_type: type[BaseException],
    exception: BaseException,
    traceback: TracebackType | None,
) -> str:
    """Format exception metadata without suppressing or re-raising the exception."""
    location = "with traceback" if traceback is not None else "without traceback"
    return f"{exception_type.__name__}: {exception} ({location})"
