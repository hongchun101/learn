"""Module 08 / tests — the mini-Airflow executor.

We exercise the four invariants the executor must hold for a DAG to
be trustworthy in production:

  1. **Order** — tasks run in topological order; the pipeline
     ``sensor -> ods -> dwd -> dws -> ads -> end`` completes with
     every layer in the right place.
  2. **Retries** — a task with ``retries=N`` is invoked up to
     ``N+1`` times when the callable raises, and the ``TaskInstance``
     records each attempt.
  3. **Skip on upstream failure** — a failed task propagates
     ``SKIPPED`` to every descendant under the default
     ``trigger_rule='all_success'``; nothing downstream runs.
  4. **DAG validation** — the cycle check and the missing-upstream
     check fire on bad graphs.

Plus a smoke test that runs the full warehouse DAG end-to-end and
verifies the ADS row count matches the DWS row count (proves the
pipeline didn't just declare success — it actually moved data).
"""
from __future__ import annotations

import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "modules" / "08-scheduler" / "src"))

from dag_demo import (  # noqa: E402
    DAG,
    DagCycleError,
    DagValidationError,
    EmptyOperator,
    FileSensor,
    LineageTracker,
    PythonOperator,
    SqlOperator,
    TaskState,
    TriggerRule,
    build_warehouse_dag,
)

DATA = ROOT / "data" / "small"


# ---------------------------------------------------------------------------
# Fixture: in-memory DuckDB with the demo dataset loaded as ods.<stem>
# ---------------------------------------------------------------------------


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    """Fresh in-memory DuckDB; ``ods.orders`` etc. loaded from parquet."""
    c = duckdb.connect(":memory:")
    c.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(DATA.glob("*.parquet")):
        c.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    return c


@pytest.fixture()
def provider(con):
    """The default context provider for the warehouse DAG."""
    def _provider(task_id: str, scheduled_at: datetime) -> dict:
        return {"con": con, "dag_id": task_id, "scheduled_at": scheduled_at}
    return _provider


@pytest.fixture()
def warehouse_dag(tmp_path):
    return build_warehouse_dag(DATA, tmp_path / "lineage.sqlite")


# ---------------------------------------------------------------------------
# Test 1 — DAG ordering and end-to-end completion
# ---------------------------------------------------------------------------


def test_warehouse_dag_runs_in_topological_order(
        warehouse_dag: DAG, provider, con: duckdb.DuckDBPyConnection,
        tmp_path: Path) -> None:
    """The warehouse DAG runs layers in dependency order and writes ADS."""
    lineage_db = tmp_path / "scheduler_lineage.sqlite"
    run = warehouse_dag.run(
        scheduled_at=datetime(2024, 1, 1),
        lineage=LineageTracker(lineage_db),
        context_provider=provider,
    )

    # Every task must be SUCCESS.
    for tid, ti in run.instances.items():
        assert ti.state == TaskState.SUCCESS, \
            f"{tid} ended in {ti.state.value}: {ti.error}"

    # The recorded execution order must equal the topological order.
    recorded = list(run.instances.keys())
    assert recorded == warehouse_dag._topo_order()

    # Order must be sensor -> ods -> dwd -> dws -> ads -> end.
    assert recorded == [
        "wait_for_orders",
        "ods_orders",
        "dwd_orders",
        "dws_orders_daily",
        "ads_gmv_daily",
        "pipeline_done",
    ]

    # And the actual data must have flowed: ADS has at least one row,
    # and exactly as many rows as DWS.
    dws_n = con.execute("SELECT COUNT(*) FROM dws.orders_daily").fetchone()[0]
    ads_n = con.execute("SELECT COUNT(*) FROM ads.gmv_daily").fetchone()[0]
    assert ads_n == dws_n > 0


# ---------------------------------------------------------------------------
# Test 2 — retries
# ---------------------------------------------------------------------------


def test_task_with_retries_eventually_succeeds(
        con: duckdb.DuckDBPyConnection) -> None:
    """A flaky callable that fails twice then succeeds runs exactly 3x."""
    attempts = {"n": 0}

    def flaky(_ctx: dict) -> None:
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise RuntimeError(f"transient {attempts['n']}")

    dag = DAG("flaky", start_date=date(2024, 1, 1))

    def provider(_task_id: str, _sa: datetime) -> dict:
        return {"con": con}

    flaky_task = PythonOperator(task_id="t", python_callable=flaky,
                                retries=3, retry_delay=0.0)
    dag.add(flaky_task)
    run = dag.run(context_provider=provider)

    ti = run.instances["t"]
    assert attempts["n"] == 3, f"expected 3 attempts, got {attempts['n']}"
    assert ti.try_number == 3
    assert ti.state == TaskState.SUCCESS


def test_task_with_retries_exhausted_fails(
        con: duckdb.DuckDBPyConnection) -> None:
    """When retries are exhausted, the task ends in FAILED, not SUCCESS."""
    def always_fails(_ctx: dict) -> None:
        raise RuntimeError("nope")

    dag = DAG("broken", start_date=date(2024, 1, 1))
    dag.add(PythonOperator(task_id="t", python_callable=always_fails,
                           retries=2, retry_delay=0.0))

    def provider(_task_id: str, _sa: datetime) -> dict:
        return {"con": con}

    run = dag.run(context_provider=provider)
    ti = run.instances["t"]
    assert ti.state == TaskState.FAILED
    assert ti.try_number == 3  # initial + 2 retries
    assert ti.error and "nope" in ti.error


# ---------------------------------------------------------------------------
# Test 3 — skip on upstream failure
# ---------------------------------------------------------------------------


def test_downstream_skips_when_upstream_fails(
        con: duckdb.DuckDBPyConnection) -> None:
    """A failing parent short-circuits every descendant under
    ``trigger_rule='all_success'``. None of the downstream callables
    are invoked; their TaskInstances end in SKIPPED."""
    called = {"down_a": 0, "down_b": 0}

    def root(_ctx: dict) -> None:
        raise RuntimeError("upstream boom")

    def child_a(_ctx: dict) -> None:
        called["down_a"] += 1

    def child_b(_ctx: dict) -> None:
        called["down_b"] += 1

    dag = DAG("skip_test", start_date=date(2024, 1, 1))
    dag.add(PythonOperator(task_id="root", python_callable=root))
    dag.add(PythonOperator(task_id="child_a", python_callable=child_a))
    dag.add(PythonOperator(task_id="child_b", python_callable=child_b))
    dag.set_downstream("root", "child_a")
    dag.set_downstream("child_a", "child_b")

    def provider(_task_id: str, _sa: datetime) -> dict:
        return {"con": con}

    run = dag.run(context_provider=provider)

    assert run.instances["root"].state == TaskState.FAILED
    assert run.instances["child_a"].state == TaskState.SKIPPED
    assert run.instances["child_b"].state == TaskState.SKIPPED
    # Crucially: the downstream callables must NOT have run.
    assert called["down_a"] == 0
    assert called["down_b"] == 0
    # try_number stays at 0 — nothing was attempted.
    assert run.instances["child_a"].try_number == 0


# ---------------------------------------------------------------------------
# Test 4 — DAG validation (cycles + missing upstreams)
# ---------------------------------------------------------------------------


def test_dag_validate_rejects_cycles() -> None:
    dag = DAG("cyc", start_date=date(2024, 1, 1))
    dag.add(EmptyOperator("a"))
    dag.add(EmptyOperator("b"))
    dag.set_downstream("a", "b")
    # Synthetic cycle: a depends on b too.
    dag.tasks["a"].depends_on.append("b")
    dag._order = None  # force re-topo
    with pytest.raises(DagCycleError):
        dag.validate()


def test_dag_validate_rejects_missing_upstream() -> None:
    dag = DAG("missing", start_date=date(2024, 1, 1))
    dag.add(EmptyOperator("a"))
    # 'a' declares a dependency on a task that was never added.
    dag.tasks["a"].depends_on.append("ghost")
    with pytest.raises(DagValidationError):
        dag.validate()


def test_dag_rejects_duplicate_task_id() -> None:
    dag = DAG("dup", start_date=date(2024, 1, 1))
    dag.add(EmptyOperator("a"))
    with pytest.raises(DagValidationError):
        dag.add(EmptyOperator("a"))


# ---------------------------------------------------------------------------
# Test 5 — backfill produces one run per logical date
# ---------------------------------------------------------------------------


def test_backfill_runs_once_per_day(
        warehouse_dag: DAG, provider,
        con: duckdb.DuckDBPyConnection) -> None:
    """``backfill(2024-01-01, 2024-01-03)`` runs the DAG 3 times,
    each scheduled_at landing on the correct day."""
    start = date(2024, 1, 1)
    end = date(2024, 1, 3)
    runs = warehouse_dag.backfill(
        start, end,
        lineage=None,
        context_provider=provider,
    )
    # 2024-01-01 through 2024-01-03 inclusive = 3 days.
    assert len(runs) == 3
    assert [r.scheduled_at.date() for r in runs] == [
        date(2024, 1, 1), date(2024, 1, 2), date(2024, 1, 3),
    ]
    # Every run must have ended in SUCCESS across all tasks.
    for run in runs:
        for ti in run.instances.values():
            assert ti.state == TaskState.SUCCESS