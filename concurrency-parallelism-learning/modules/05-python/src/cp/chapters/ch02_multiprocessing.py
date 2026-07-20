"""Chapter 2: process isolation, messages, proxies, and shared memory."""

from collections.abc import Iterable
from dataclasses import dataclass
from multiprocessing import Array, Lock, Manager, Pipe, Pool, Process, Queue, Value
from multiprocessing.connection import Connection
from multiprocessing.queues import Queue as QueueType
from typing import Any, cast


@dataclass(frozen=True)
class MultiprocessingReport:
    """Summarize results produced by multiprocessing primitives."""

    queue_value: int
    pipe_value: str
    manager_value: int
    pool_values: tuple[int, ...]
    shared_value: int
    shared_array: tuple[int, ...]


def square(value: int) -> int:
    """Return a square from an importable process-worker function."""
    return value * value


def _queue_worker(queue: QueueType[int], value: int) -> None:
    queue.put(value * 2)


def _pipe_worker(connection: Connection, message: str) -> None:
    try:
        connection.send(message.upper())
    finally:
        connection.close()


def _increment_shared(value: Any, shared_array: Any, lock: Any) -> None:
    with lock:
        value.value += 1
        shared_array[0] += 1


def process_queue_round_trip(value: int) -> int:
    """Send a result from a child process through a ``Queue``."""
    queue: QueueType[int] = Queue()
    process = Process(target=_queue_worker, args=(queue, value))
    process.start()
    result = queue.get()
    process.join()
    queue.close()
    queue.join_thread()
    if process.exitcode != 0:
        raise RuntimeError(f"queue worker exited with code {process.exitcode}")
    return result


def pipe_round_trip(message: str) -> str:
    """Exchange one message over a one-way ``Pipe``."""
    receive, send = Pipe(duplex=False)
    process = Process(target=_pipe_worker, args=(send, message))
    process.start()
    send.close()
    result = cast(str, receive.recv())
    receive.close()
    process.join()
    if process.exitcode != 0:
        raise RuntimeError(f"pipe worker exited with code {process.exitcode}")
    return result


def pool_map(values: Iterable[int], processes: int = 2) -> list[int]:
    """Map an importable CPU function through ``multiprocessing.Pool``."""
    with Pool(processes=processes) as pool:
        return pool.map(square, values)


def run_multiprocessing_tour() -> MultiprocessingReport:
    """Exercise Process, Queue, Pipe, Manager, Pool, Value, Array, and Lock."""
    queue_value = process_queue_round_trip(21)
    pipe_value = pipe_round_trip("process")

    with Manager() as manager:
        proxy = manager.dict({"count": 1})
        proxy["count"] = proxy["count"] + 1
        manager_value = proxy["count"]

    pool_values = tuple(pool_map((1, 2, 3), processes=2))
    shared_value = Value("i", 0, lock=False)
    shared_array = Array("i", [0, 2, 3], lock=False)
    lock = Lock()
    workers = [
        Process(target=_increment_shared, args=(shared_value, shared_array, lock))
        for _ in range(3)
    ]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join()
        if worker.exitcode != 0:
            raise RuntimeError(f"shared-memory worker exited with code {worker.exitcode}")

    return MultiprocessingReport(
        queue_value=queue_value,
        pipe_value=pipe_value,
        manager_value=manager_value,
        pool_values=pool_values,
        shared_value=cast(int, shared_value.value),
        shared_array=tuple(cast(int, item) for item in shared_array),
    )
