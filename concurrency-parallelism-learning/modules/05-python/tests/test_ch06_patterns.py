"""Seven scenarios mirroring the TypeScript cross-language contract tests."""

import asyncio
from operator import add

import pytest

from cp.chapters.ch06_patterns import (
    AsyncBarrier,
    BoundedMpmcQueue,
    QueueClosedError,
    fan_out_fan_in,
    parallel_reduce,
    pipeline,
    run_rate_limiter,
)


@pytest.mark.asyncio
async def test_fan_out_fan_in_preserves_order_despite_completion_order() -> None:
    inputs = list(range(100))
    gates = [asyncio.Event() for _ in inputs]

    async def work(value: int) -> int:
        await gates[value].wait()
        return value * 2

    running = asyncio.create_task(fan_out_fan_in(work, inputs, parallelism=16))
    for start in range(0, len(inputs), 16):
        for index in reversed(range(start, min(start + 16, len(inputs)))):
            gates[index].set()
        await asyncio.sleep(0)
    assert await running == [value * 2 for value in inputs]


@pytest.mark.asyncio
async def test_fan_out_fan_in_handles_parallelism_boundaries() -> None:
    async def work(value: int) -> int:
        await asyncio.sleep(0)
        return value + 1

    for parallelism in (1, 2, 5, 10):
        assert await fan_out_fan_in(work, [1, 2, 3, 4, 5], parallelism) == [2, 3, 4, 5, 6]
    assert await fan_out_fan_in(lambda _: None, [1, 2], 2) == [None, None]


@pytest.mark.asyncio
async def test_pipeline_applies_every_stage_in_order() -> None:
    async def double(value: int) -> int:
        await asyncio.sleep(0)
        return value * 2

    stages = (lambda value: value + 1, double, lambda value: value - 3)
    assert await pipeline(stages, [0, 1, 2, 3]) == [-1, 1, 3, 5]


@pytest.mark.asyncio
async def test_rate_limiter_respects_rate_window() -> None:
    produced = await run_rate_limiter(rate_per_sec=100, duration_ms=200)
    assert 19 <= produced <= 21


@pytest.mark.asyncio
async def test_barrier_blocks_until_all_parties_arrive() -> None:
    barrier = AsyncBarrier(4)
    entered = [asyncio.Event() for _ in range(4)]
    release_last = asyncio.Event()
    released = 0

    async def party(index: int) -> None:
        nonlocal released
        entered[index].set()
        if index == 3:
            await release_last.wait()
        await barrier.arrive_and_wait()
        released += 1

    tasks = [asyncio.create_task(party(index)) for index in range(4)]
    for event in entered:
        await event.wait()
    await asyncio.sleep(0)
    assert released == 0
    release_last.set()
    await asyncio.gather(*tasks)
    assert released == 4


@pytest.mark.asyncio
async def test_mpmc_queue_round_trips_concurrently() -> None:
    queue = BoundedMpmcQueue[int](capacity=4)
    collected: list[int] = []

    async def producer(producer_id: int) -> None:
        for index in range(100):
            await queue.enqueue(producer_id * 1_000 + index)

    async def consumer() -> None:
        for _ in range(75):
            value = await queue.dequeue(timeout_ms=1_000)
            assert value is not None
            collected.append(value)

    producers = [asyncio.create_task(producer(index)) for index in range(3)]
    consumers = [asyncio.create_task(consumer()) for _ in range(4)]
    await asyncio.gather(*producers, *consumers)
    await queue.close()
    assert len(collected) == 300
    assert len(set(collected)) == 300
    assert await queue.dequeue(timeout_ms=0) is None
    with pytest.raises(QueueClosedError):
        await queue.enqueue(1)


@pytest.mark.asyncio
async def test_parallel_reduce_matches_associative_sequential_reduce() -> None:
    inputs = list(range(1, 1_001))
    expected = sum(inputs)
    for parallelism in (1, 2, 4, 8, 16, 32, 100):
        assert await parallel_reduce(inputs, add, parallelism) == expected
    assert await parallel_reduce(["a", "b", "c", "d"], add, 3) == "abcd"
