"""Tests for Chapter 4 asyncio primitives."""

import asyncio

import pytest

from cp.chapters.ch04_asyncio import (
    call_blocking_in_thread,
    collect_task_group_errors,
    gather_squares,
    queue_pipeline,
    synchronization_tour,
    task_group_squares,
    wait_with_two_deadlines,
)


@pytest.mark.asyncio
async def test_gather_and_task_group_preserve_input_order() -> None:
    assert await gather_squares((3, 1, 2)) == [9, 1, 4]
    assert await task_group_squares((3, 1, 2)) == [9, 1, 4]


@pytest.mark.asyncio
async def test_queue_and_synchronization_primitives() -> None:
    assert await queue_pipeline((1, 2, 3, 4)) == [2, 4, 6, 8]
    peak, event_set = await synchronization_tour()
    assert 1 <= peak <= 2
    assert event_set


@pytest.mark.asyncio
async def test_deadlines_to_thread_and_exception_group() -> None:
    unset = asyncio.Event()
    assert not await wait_with_two_deadlines(unset, 0.001)
    unset.set()
    assert await wait_with_two_deadlines(unset, 0.1)
    assert await call_blocking_in_thread(str.upper, "blocking") == "BLOCKING"
    assert await collect_task_group_errors() == ("left", "right")
