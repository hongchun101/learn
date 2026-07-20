"""Tests for Chapter 1 threading primitives."""

from threading import Condition, Thread, local

from cp.chapters.ch01_threading import (
    locked_sum,
    match_thread_state,
    run_threading_tour,
    thread_local_value,
    wait_for_predicate,
)


def test_threading_tour_exercises_every_primitive() -> None:
    report = run_threading_tour()
    assert report.counter == 4
    assert report.recursive_depth == 3
    assert report.semaphore_peak == 2
    assert report.timer_fired
    assert report.barrier_indices == (0, 1, 2)
    assert report.local_values == ("alpha", "beta")
    assert match_thread_state(report) == "coordinated"


def test_lock_and_condition_protect_observable_state() -> None:
    assert locked_sum(range(101)) == 5050
    condition = Condition()
    state = {"ready": False}
    waiter = Thread(target=wait_for_predicate, args=(condition, lambda: state["ready"]))
    waiter.start()
    with condition:
        state["ready"] = True
        condition.notify_all()
    waiter.join()
    assert not waiter.is_alive()


def test_local_has_per_thread_default() -> None:
    storage = local()
    storage.value = "main"
    observed: list[str] = []
    child = Thread(target=lambda: observed.append(thread_local_value(storage, "missing")))
    child.start()
    child.join()
    assert observed == ["missing"]
    assert thread_local_value(storage) == "main"
