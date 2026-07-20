"""Tests for Chapter 5's practical GIL experiment."""

import os
import sys

from cp.chapters.ch05_gil import cpu_bound_kernel, free_threading_note, measure_gil


def test_cpu_kernel_is_deterministic_and_reports_current_pid() -> None:
    first = cpu_bound_kernel(10_000)
    second = cpu_bound_kernel(10_000)
    assert first == second
    assert first[0] == os.getpid()


def test_measurement_demonstrates_gil_identity_and_process_parallelism() -> None:
    measurement = measure_gil(iterations_per_task=2_000_000, tasks=2)
    assert measurement.sequential.checksums == measurement.threads.checksums
    assert measurement.sequential.checksums == measurement.processes.checksums
    assert set(measurement.threads.worker_pids) == {os.getpid()}
    assert os.getpid() not in set(measurement.processes.worker_pids)
    assert len(set(measurement.processes.worker_pids)) == 2
    assert measurement.switch_interval_seconds == sys.getswitchinterval()
    assert measurement.sequential.seconds > 0
    assert measurement.threads.seconds > 0
    assert measurement.processes.seconds > 0
    # Conventional CPython threads all execute bytecode behind one process-wide GIL.
    is_gil_enabled = getattr(sys, "_is_gil_enabled", lambda: True)
    if not is_gil_enabled():
        return
    assert measurement.thread_speedup < 1.5


def test_free_threading_note_names_pep_and_adoption_risk() -> None:
    note = free_threading_note()
    assert "PEP 703" in note
    assert "extension compatibility" in note
