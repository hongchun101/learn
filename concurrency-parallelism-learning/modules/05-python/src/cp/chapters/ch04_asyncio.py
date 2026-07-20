"""Chapter 4: structured cooperative concurrency with :mod:`asyncio`."""

import asyncio
import inspect
from collections.abc import Awaitable, Callable, Iterable

type AsyncFunction[T, R] = Callable[[T], R | Awaitable[R]]


async def maybe_await[T](value: T | Awaitable[T]) -> T:
    """Resolve an awaitable or return an immediate value unchanged."""
    if inspect.isawaitable(value):
        return await value
    return value


async def gather_squares(values: Iterable[int]) -> list[int]:
    """Run square coroutines concurrently while preserving input order."""

    async def square(value: int) -> int:
        await asyncio.sleep(0)
        return value * value

    return list(await asyncio.gather(*(square(value) for value in values)))


async def task_group_squares(values: Iterable[int]) -> list[int]:
    """Compute squares in a structured ``TaskGroup`` scope."""
    tasks: list[asyncio.Task[int]] = []
    async with asyncio.TaskGroup() as group:
        for value in values:
            tasks.append(group.create_task(_square_after_checkpoint(value)))
    return [task.result() for task in tasks]


async def _square_after_checkpoint(value: int) -> int:
    await asyncio.sleep(0)
    return value * value


async def collect_task_group_errors() -> tuple[str, ...]:
    """Handle selected leaves from a ``TaskGroup`` ``ExceptionGroup``."""
    ready = asyncio.Event()

    async def fail(message: str) -> None:
        await ready.wait()
        raise ValueError(message)

    messages: list[str] = []
    try:
        async with asyncio.TaskGroup() as group:
            group.create_task(fail("left"))
            group.create_task(fail("right"))
            ready.set()
    except* ValueError as group:
        messages.extend(str(error) for error in group.exceptions)
    return tuple(sorted(messages))


async def queue_pipeline(values: Iterable[int]) -> list[int]:
    """Pass values through a bounded ``asyncio.Queue`` producer-consumer pair."""
    queue: asyncio.Queue[int | None] = asyncio.Queue(maxsize=2)
    results: list[int] = []

    async def produce() -> None:
        for value in values:
            await queue.put(value)
        await queue.put(None)

    async def consume() -> None:
        while (value := await queue.get()) is not None:
            results.append(value * 2)
            queue.task_done()
        queue.task_done()

    async with asyncio.TaskGroup() as group:
        group.create_task(produce())
        group.create_task(consume())
    await queue.join()
    return results


async def synchronization_tour(parties: int = 3) -> tuple[int, bool]:
    """Exercise Semaphore, Event, Lock, and Condition with loop tasks."""
    semaphore = asyncio.Semaphore(2)
    event = asyncio.Event()
    lock = asyncio.Lock()
    condition = asyncio.Condition(lock)
    arrived = 0
    peak = 0
    active = 0

    async def worker() -> None:
        nonlocal active, arrived, peak
        await event.wait()
        async with semaphore:
            async with condition:
                active += 1
                peak = max(peak, active)
                arrived += 1
                condition.notify_all()
            await asyncio.sleep(0)
            async with lock:
                active -= 1

    tasks = [asyncio.create_task(worker()) for _ in range(parties)]
    event.set()
    async with condition:
        await condition.wait_for(lambda: arrived == parties)
    await asyncio.gather(*tasks)
    return peak, event.is_set()


async def wait_with_two_deadlines(event: asyncio.Event, seconds: float) -> bool:
    """Bound waits with both ``wait_for`` and ``asyncio.timeout`` APIs."""
    try:
        await asyncio.wait_for(event.wait(), timeout=seconds)
        async with asyncio.timeout(seconds):
            await event.wait()
    except TimeoutError:
        return False
    return True


async def call_blocking_in_thread[T, R](function: Callable[[T], R], argument: T) -> R:
    """Move one blocking call off the event-loop thread with ``to_thread``."""
    return await asyncio.to_thread(function, argument)
