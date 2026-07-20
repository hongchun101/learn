"""Chapter 6: six canonical cross-language concurrency patterns."""

import asyncio
import inspect
from collections import deque
from collections.abc import Awaitable, Callable, Iterable, Sequence
from functools import reduce
from time import perf_counter

type MaybeAwaitable[T] = T | Awaitable[T]
type Worker[I, O] = Callable[[I], MaybeAwaitable[O]]
type Stage[T] = Callable[[T], MaybeAwaitable[T]]
type Combine[T] = Callable[[T, T], T]
_MISSING = object()


async def _resolve[T](value: MaybeAwaitable[T]) -> T:
    if inspect.isawaitable(value):
        return await value
    return value


async def fan_out_fan_in[I, O](
    work: Worker[I, O], inputs: Sequence[I], parallelism: int
) -> list[O]:
    """Run a bounded worker set and return outputs in source order."""
    if parallelism < 1:
        raise ValueError("parallelism must be at least one")
    if not inputs:
        return []

    next_index = 0
    results: list[O | object] = [_MISSING] * len(inputs)
    index_lock = asyncio.Lock()

    async def worker() -> None:
        nonlocal next_index
        while True:
            async with index_lock:
                index = next_index
                next_index += 1
            if index >= len(inputs):
                return
            results[index] = await _resolve(work(inputs[index]))

    async with asyncio.TaskGroup() as group:
        for _ in range(min(parallelism, len(inputs))):
            group.create_task(worker())
    if any(result is _MISSING for result in results):
        raise RuntimeError("fan-out worker did not fill every result slot")
    return [result for result in results]  # type: ignore[misc]  # slots checked above


async def pipeline[T](stages: Sequence[Stage[T]], source: Sequence[T]) -> list[T]:
    """Apply every synchronous or asynchronous stage to each source item in order."""
    results: list[T] = []
    for item in source:
        value = item
        for stage in stages:
            value = await _resolve(stage(value))
        results.append(value)
    return results


async def run_rate_limiter(rate_per_sec: float, duration_ms: float) -> int:
    """Pace admissions to at most ``rate_per_sec`` over the requested window."""
    if rate_per_sec <= 0:
        raise ValueError("rate_per_sec must be positive")
    if duration_ms < 0:
        raise ValueError("duration_ms must be non-negative")

    start = perf_counter()
    deadline = start + duration_ms / 1_000
    interval = 1.0 / rate_per_sec
    next_allowed = start
    produced = 0
    while perf_counter() < deadline:
        now = perf_counter()
        if now >= next_allowed:
            produced += 1
            next_allowed += interval
        else:
            await asyncio.sleep(next_allowed - now)
    return produced


class AsyncBarrier:
    """A reusable N-party barrier protected by an asyncio condition."""

    def __init__(self, parties: int) -> None:
        """Create a barrier that releases one generation after ``parties`` arrivals."""
        if parties < 1:
            raise ValueError("parties must be at least one")
        self.parties = parties
        self._arrived = 0
        self._generation = 0
        self._condition = asyncio.Condition()

    async def arrive_and_wait(self) -> None:
        """Block the caller until all parties in its generation arrive."""
        async with self._condition:
            generation = self._generation
            self._arrived += 1
            if self._arrived == self.parties:
                self._arrived = 0
                self._generation += 1
                self._condition.notify_all()
                return
            await self._condition.wait_for(lambda: generation != self._generation)


class QueueClosedError(RuntimeError):
    """Signal an attempt to enqueue after a bounded queue has closed."""


class BoundedMpmcQueue[T]:
    """A bounded multiple-producer, multiple-consumer asynchronous queue."""

    def __init__(self, capacity: int) -> None:
        """Create an empty queue with a fixed positive capacity."""
        if capacity < 1:
            raise ValueError("capacity must be at least one")
        self.capacity = capacity
        self._items: deque[T] = deque()
        self._closed = False
        self._condition = asyncio.Condition()

    async def enqueue(self, item: T) -> None:
        """Add an item, waiting for capacity, or fail if the queue closes."""
        async with self._condition:
            await self._condition.wait_for(
                lambda: len(self._items) < self.capacity or self._closed
            )
            if self._closed:
                raise QueueClosedError("queue closed")
            self._items.append(item)
            self._condition.notify_all()

    async def dequeue(self, timeout_ms: float) -> T | None:
        """Remove one item, returning ``None`` on timeout or closed-and-empty."""
        if timeout_ms < 0:
            raise ValueError("timeout_ms must be non-negative")
        deadline = perf_counter() + timeout_ms / 1_000
        async with self._condition:
            while not self._items:
                if self._closed:
                    return None
                remaining = deadline - perf_counter()
                if remaining <= 0:
                    return None
                try:
                    async with asyncio.timeout(remaining):
                        await self._condition.wait()
                except TimeoutError:
                    return None
            item = self._items.popleft()
            self._condition.notify_all()
            return item

    async def close(self) -> None:
        """Reject future enqueues and wake every blocked producer and consumer."""
        async with self._condition:
            self._closed = True
            self._condition.notify_all()


async def parallel_reduce[T](
    inputs: Sequence[T], combine: Combine[T], parallelism: int
) -> T:
    """Reduce contiguous chunks concurrently, requiring an associative combiner.

    Contiguous chunks preserve operand order for associative operations that are
    not commutative. Pure-Python combiners remain GIL-bound when ``to_thread`` is
    used; choose a process-safe top-level combiner for CPU speedup in applications.
    """
    if not inputs:
        raise ValueError("cannot reduce an empty input")
    worker_count = max(1, min(parallelism, len(inputs)))
    chunk_size = (len(inputs) + worker_count - 1) // worker_count
    chunks = [inputs[index : index + chunk_size] for index in range(0, len(inputs), chunk_size)]
    partials = await asyncio.gather(
        *(asyncio.to_thread(reduce, combine, chunk) for chunk in chunks)
    )
    return reduce(combine, partials)


def collect_sync[T](values: Iterable[T]) -> list[T]:
    """Materialize an iterable for examples that need a stable source collection."""
    return list(values)
