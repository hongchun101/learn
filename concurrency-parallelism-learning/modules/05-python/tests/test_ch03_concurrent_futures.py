"""Tests for Chapter 3 concurrent futures."""

from cp.chapters.ch03_concurrent_futures import (
    map_with_processes,
    map_with_threads,
    run_futures_tour,
)


def test_both_executor_policies_share_ordered_map_api() -> None:
    assert map_with_threads(lambda value: value + 1, (1, 2, 3)) == [2, 3, 4]
    assert map_with_processes((1, 2, 3)) == [1, 8, 27]


def test_futures_tour_observes_callbacks_wait_and_completion() -> None:
    report = run_futures_tour()
    assert report.input_order == (1, 2, 3)
    assert sorted(report.completion_order) == [1, 2, 3]
    assert report.callback_results == (3, 2, 1)
    assert report.process_results == (1, 8, 27)
