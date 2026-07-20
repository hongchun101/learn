"""Tests for Chapter 2 multiprocessing primitives."""

from cp.chapters.ch02_multiprocessing import (
    pipe_round_trip,
    pool_map,
    process_queue_round_trip,
    run_multiprocessing_tour,
)


def test_queue_pipe_and_pool_round_trip() -> None:
    assert process_queue_round_trip(7) == 14
    assert pipe_round_trip("hello") == "HELLO"
    assert pool_map((2, 3, 4)) == [4, 9, 16]


def test_multiprocessing_tour_exercises_shared_and_proxy_state() -> None:
    report = run_multiprocessing_tour()
    assert report.queue_value == 42
    assert report.pipe_value == "PROCESS"
    assert report.manager_value == 2
    assert report.pool_values == (1, 4, 9)
    assert report.shared_value == 3
    assert report.shared_array == (3, 2, 3)
