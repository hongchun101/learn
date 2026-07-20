"""Pure-Python Airflow-style DAG executor.

This module is a deliberately small re-implementation of the *executor*
half of Apache Airflow. It is not the full Airflow platform — there is
no scheduler daemon, no webserver, no executor pool — just enough to
demonstrate, on a single laptop, the moving parts of a DAG run:

  - ``Task`` wraps a Python callable with retry / timeout semantics.
  - ``DAG`` holds tasks and edges, validates them, and runs them in
    topological order.
  - ``PythonOperator`` / ``SqlOperator`` / ``EmptyOperator`` are the
    concrete task types (the "operator" layer Airflow exposes).
  - ``FileSensor`` / ``TableSensor`` poke a filesystem path or a
    DuckDB table until it is ready, just like Airflow sensors.
  - ``run(scheduled_at=...)`` performs topological execution: failed
    tasks propagate ``UPSTREAM_FAILED`` so downstream tasks are
    *skipped*, exactly like ``trigger_rule='all_success'`` + a fail.
  - ``backfill(start, end)`` replays the DAG for a date range, one
    ``scheduled_at`` per day, just like ``catchup=True``.
  - ``SLA`` lets you assert that a task finishes within a budget;
    overruns are recorded but the pipeline does not abort.
  - ``LineageTracker`` records ``(task, artifact)`` edges as tasks
    execute; this is what Airflow's OpenLineage integration emits.

The pipeline here mirrors module 07 (offline warehouse): ODS -> DWD ->
DWS -> ADS, with one task per layer, plus a sensor that waits for the
raw Parquet files and an SLA that guards the ADS layer.

Run with::

    python -m modules.08-scheduler.src.dag_demo
"""
from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
import time
import traceback
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Callable

import duckdb

LOG = logging.getLogger("scheduler")


# ---------------------------------------------------------------------------
# Status / trigger-rule semantics
# ---------------------------------------------------------------------------


class TaskState(str, Enum):
    """The lifecycle states a task instance can occupy.

    Mirrors Airflow's ``airflow.utils.state.State`` (minus the
    Airflow-specific "deferred" / "scheduled" which require a
    metadatabase).
    """

    NONE = "none"
    UPSTREAM_FAILED = "upstream_failed"
    SKIPPED = "skipped"
    SUCCESS = "success"
    FAILED = "failed"
    UP_FOR_RETRY = "up_for_retry"


@dataclass
class TaskInstance:
    """One concrete run of a task for one ``scheduled_at``."""

    task_id: str
    scheduled_at: datetime
    state: TaskState = TaskState.NONE
    try_number: int = 0
    start_ts: datetime | None = None
    end_ts: datetime | None = None
    error: str | None = None
    sla_miss: bool = False


class TriggerRule(str, Enum):
    """Subset of Airflow trigger rules we care about.

    ``ALL_SUCCESS`` is the default; the demo only exercises that rule
    plus the implicit "if upstream failed, skip" behaviour Airflow
    applies to *all* rules with ``depends_on_past=False``.
    """

    ALL_SUCCESS = "all_success"
    ALL_DONE = "all_done"
    ONE_SUCCESS = "one_success"


# ---------------------------------------------------------------------------
# Lineage
# ---------------------------------------------------------------------------


@dataclass
class LineageTracker:
    """Captures ``(task, artifact, kind)`` triples as tasks execute.

    Same shape OpenLineage emits; here it lives in a tiny SQLite DB
    so the lineage graph survives a process restart.
    """

    db_path: Path

    def __post_init__(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as con:
            con.execute(
                "CREATE TABLE IF NOT EXISTS lineage ("
                "  dag_id TEXT, task_id TEXT, scheduled_at TEXT,"
                "  artifact TEXT, kind TEXT, ts TEXT)"
            )

    def emit(self, dag_id: str, task_id: str, scheduled_at: datetime,
             artifact: str, kind: str) -> None:
        with sqlite3.connect(self.db_path) as con:
            con.execute(
                "INSERT INTO lineage VALUES (?, ?, ?, ?, ?, ?)",
                (dag_id, task_id, scheduled_at.isoformat(),
                 artifact, kind, datetime.utcnow().isoformat()),
            )

    def artifacts(self, task_id: str) -> list[str]:
        with sqlite3.connect(self.db_path) as con:
            return [r[0] for r in con.execute(
                "SELECT DISTINCT artifact FROM lineage WHERE task_id = ?"
                " ORDER BY artifact", (task_id,))]

    def count(self, task_id: str | None = None) -> int:
        with sqlite3.connect(self.db_path) as con:
            if task_id is None:
                return con.execute(
                    "SELECT COUNT(*) FROM lineage").fetchone()[0]
            return con.execute(
                "SELECT COUNT(*) FROM lineage WHERE task_id = ?",
                (task_id,)).fetchone()[0]


# ---------------------------------------------------------------------------
# Task & DAG
# ---------------------------------------------------------------------------


@dataclass
class Task:
    """A node in a DAG: an operator wrapped with execution semantics.

    Attributes mirror the columns of ``airflow.tasks.TaskInstance`` that
    actually matter to a single-machine executor:

    - ``retries`` / ``retry_delay`` — how many times to re-invoke on
      failure, and how long to sleep between attempts.
    - ``depends_on`` — list of upstream task_ids (edges).
    - ``trigger_rule`` — only ``ALL_SUCCESS`` is fully exercised.
    - ``sla`` — optional duration budget; over it and we mark
      ``sla_miss`` on the TaskInstance.
    """

    task_id: str
    callable: Callable[..., Any]
    retries: int = 0
    retry_delay: float = 0.0
    depends_on: list[str] = field(default_factory=list)
    trigger_rule: TriggerRule = TriggerRule.ALL_SUCCESS
    sla: timedelta | None = None
    operator_name: str = "PythonOperator"

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Task {self.task_id} ({self.operator_name})>"


class DagCycleError(ValueError):
    """Raised when a DAG has a cycle or a dangling edge."""


class DagValidationError(ValueError):
    """Raised on missing upstream ids or duplicate task ids."""


class DagRun:
    """One execution of a DAG for a specific ``scheduled_at``."""

    def __init__(self, dag_id: str, scheduled_at: datetime,
                 lineage: LineageTracker | None = None) -> None:
        self.dag_id = dag_id
        self.scheduled_at = scheduled_at
        self.instances: dict[str, TaskInstance] = {}
        self.lineage = lineage

    def get(self, task_id: str) -> TaskInstance:
        return self.instances[task_id]


# ---------------------------------------------------------------------------
# Concrete operators
# ---------------------------------------------------------------------------


class PythonOperator(Task):
    """Run a Python callable. The Airflow spelling for an arbitrary task."""

    def __init__(self, task_id: str, python_callable: Callable[..., Any],
                 **kwargs: Any) -> None:
        super().__init__(task_id=task_id, callable=python_callable,
                         operator_name="PythonOperator", **kwargs)


class EmptyOperator(Task):
    """No-op task, useful as a join point or a DAG-level marker."""

    def __init__(self, task_id: str, **kwargs: Any) -> None:
        super().__init__(task_id=task_id, callable=lambda _ctx: None,
                         operator_name="EmptyOperator", **kwargs)


class SqlOperator(Task):
    """Run SQL statements against a DuckDB connection.

    The connection is injected by the DAG via ``context['con']``; this
    mirrors how Airflow passes connections through the hook layer.
    Statements are split on ``;`` outside of single-quoted strings.
    """

    def __init__(self, task_id: str, sql: str, **kwargs: Any) -> None:
        def _run(context: dict) -> None:
            con = context["con"]
            for stmt in _split_sql(sql):
                if stmt:
                    con.execute(stmt)

        super().__init__(task_id=task_id, callable=_run,
                         operator_name="SqlOperator", **kwargs)


def _split_sql(sql: str) -> list[str]:
    """Split ``sql`` on ``;`` outside single-quoted strings."""
    out: list[str] = []
    buf: list[str] = []
    in_str = False
    for ch in sql:
        if ch == "'" and (not buf or buf[-1] != "\\"):
            in_str = not in_str
        if ch == ";" and not in_str:
            out.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return [s for s in out if s]


# ---------------------------------------------------------------------------
# Sensors
# ---------------------------------------------------------------------------


class FileSensor(Task):
    """Poke a path until it exists. ``mode='reschedule'`` analogue."""

    def __init__(self, task_id: str, filepath: Path,
                 poke_interval: float = 0.0, **kwargs: Any) -> None:
        def _poke(context: dict) -> None:
            if not filepath.exists():
                raise FileNotFoundError(str(filepath))

        super().__init__(task_id=task_id, callable=_poke,
                         operator_name="FileSensor", **kwargs)
        self.filepath = filepath


class TableSensor(Task):
    """Poke a DuckDB table until it has at least one row."""

    def __init__(self, task_id: str, table_fqn: str, **kwargs: Any) -> None:
        def _poke(context: dict) -> None:
            con = context["con"]
            n = con.execute(
                f"SELECT COUNT(*) FROM {table_fqn}").fetchone()[0]
            if n == 0:
                raise RuntimeError(f"{table_fqn} is empty")

        super().__init__(task_id=task_id, callable=_poke,
                         operator_name="TableSensor", **kwargs)
        self.table_fqn = table_fqn


# ---------------------------------------------------------------------------
# DAG
# ---------------------------------------------------------------------------


class DAG:
    """The container for tasks and edges."""

    def __init__(self, dag_id: str, start_date: date,
                 schedule_interval: str = "@daily",
                 end_date: date | None = None,
                 max_active_runs: int = 1) -> None:
        self.dag_id = dag_id
        self.start_date = start_date
        self.end_date = end_date
        self.schedule_interval = schedule_interval
        self.max_active_runs = max_active_runs
        self.tasks: dict[str, Task] = {}
        self._order: list[str] | None = None

    # -- definition API -------------------------------------------

    def add(self, task: Task) -> Task:
        if task.task_id in self.tasks:
            raise DagValidationError(
                f"duplicate task_id {task.task_id!r} in {self.dag_id}")
        self.tasks[task.task_id] = task
        self._order = None
        return task

    def set_downstream(self, upstream_id: str,
                       downstream_id: str) -> None:
        """``a.set_downstream(b)`` means ``b depends on a``."""
        self.tasks[downstream_id].depends_on.append(upstream_id)
        self._order = None

    # -- validation -----------------------------------------------

    def validate(self) -> None:
        for tid, task in self.tasks.items():
            for up in task.depends_on:
                if up not in self.tasks:
                    raise DagValidationError(
                        f"{tid} depends on missing task {up!r}")
        order = self._topo_order()
        if len(order) != len(self.tasks):
            raise DagCycleError(f"{self.dag_id} has a cycle")

    def _topo_order(self) -> list[str]:
        """Stable topological order.

        We use Kahn's algorithm and break ties by task_id so the
        resulting schedule is deterministic — important for tests
        that assert "tasks ran in this exact order".
        """
        if self._order is not None:
            return self._order
        in_deg: dict[str, int] = {tid: 0 for tid in self.tasks}
        children: dict[str, list[str]] = {tid: [] for tid in self.tasks}
        for tid, task in self.tasks.items():
            in_deg[tid] = len(task.depends_on)
            for up in task.depends_on:
                children[up].append(tid)
        ready = sorted([tid for tid, d in in_deg.items() if d == 0])
        order: list[str] = []
        while ready:
            tid = ready.pop(0)
            order.append(tid)
            for child in children[tid]:
                in_deg[child] -= 1
                if in_deg[child] == 0:
                    ready.append(child)
            ready.sort()
        self._order = order
        return order

    # -- execution ------------------------------------------------

    def run(self, scheduled_at: datetime | None = None,
            lineage: LineageTracker | None = None,
            context_provider: Callable[[str, datetime], dict] | None = None
            ) -> DagRun:
        """Run the DAG for a single logical date.

        ``context_provider`` returns the per-task context dict (the
        Airflow ``ti`` / ``dag_run`` / ``conf`` bundle). Optional;
        default is ``{dag_id, scheduled_at}``.
        """
        self.validate()
        if scheduled_at is None:
            scheduled_at = datetime.combine(self.start_date,
                                           datetime.min.time())
        run = DagRun(self.dag_id, scheduled_at, lineage=lineage)

        for tid in self._topo_order():
            task = self.tasks[tid]
            ti = TaskInstance(task_id=tid, scheduled_at=scheduled_at)

            # Upstream gating: any upstream failed OR skipped
            # (skipped because *its* upstream failed) -> skip.
            upstream_states = [run.get(u).state for u in task.depends_on]
            upstream_terminal = {TaskState.FAILED, TaskState.SKIPPED,
                                 TaskState.UPSTREAM_FAILED}
            if task.trigger_rule == TriggerRule.ALL_SUCCESS and \
                    any(s in upstream_terminal for s in upstream_states):
                ti.state = TaskState.SKIPPED
                ti.end_ts = datetime.utcnow()
                run.instances[tid] = ti
                LOG.info("[%s] %s -> SKIPPED (upstream failed)", tid,
                         scheduled_at.date())
                continue

            run.instances[tid] = ti
            ctx = context_provider(tid, scheduled_at) if context_provider \
                else {"dag_id": task.task_id,
                      "scheduled_at": ti.scheduled_at}
            self._execute_task(task, ti, ctx)

            if lineage is not None and ti.state == TaskState.SUCCESS:
                lineage.emit(self.dag_id, tid, scheduled_at,
                             f"layer.{tid}", "TABLE")

        return run

    def _execute_task(self, task: Task, ti: TaskInstance,
                      context: dict[str, Any]) -> None:
        attempts = task.retries + 1
        last_err: str | None = None
        for attempt in range(1, attempts + 1):
            ti.try_number = attempt
            ti.start_ts = datetime.utcnow()
            try:
                task.callable(context)
            except Exception as exc:  # noqa: BLE001 - intentional
                last_err = (f"{type(exc).__name__}: {exc}\n"
                            f"{traceback.format_exc()}")
                ti.end_ts = datetime.utcnow()
                LOG.warning("[%s] attempt %d/%d failed: %s",
                            task.task_id, attempt, attempts, exc)
                if attempt < attempts:
                    ti.state = TaskState.UP_FOR_RETRY
                    if task.retry_delay:
                        time.sleep(task.retry_delay)
                    continue
                ti.state = TaskState.FAILED
                ti.error = last_err
                return
            else:
                ti.end_ts = datetime.utcnow()
                ti.state = TaskState.SUCCESS
                if task.sla and (ti.end_ts - ti.start_ts) > task.sla:
                    ti.sla_miss = True
                    LOG.warning("[%s] SLA miss: %s > %s",
                                task.task_id, ti.end_ts - ti.start_ts,
                                task.sla)
                return

    # -- backfill -------------------------------------------------

    def backfill(self, start: date, end: date,
                 lineage: LineageTracker | None = None,
                 context_provider: Callable[[str, datetime], dict] | None = None
                 ) -> list[DagRun]:
        """Replay the DAG for every day in [start, end]."""
        runs: list[DagRun] = []
        cur = start
        while cur <= end:
            scheduled_at = datetime.combine(cur, datetime.min.time())
            runs.append(self.run(scheduled_at, lineage=lineage,
                                 context_provider=context_provider))
            cur += timedelta(days=1)
        return runs


# ---------------------------------------------------------------------------
# Pipeline definition — mirrors module 07's ODS->DWD->DWS->ADS layout
# ---------------------------------------------------------------------------


def build_warehouse_dag(data_dir: Path,
                        lineage_db: Path | None = None) -> DAG:
    """Return a DAG that runs the warehouse pipeline.

    The operators are intentionally tiny — they only build the layer
    the test asserts on. Module 07 does the full layered model with
    many more columns; here we keep the per-layer CTE short so the
    DAG executor itself is the focus.
    """
    dag = DAG(dag_id="warehouse_offline",
              start_date=date(2024, 1, 1),
              schedule_interval="@daily")

    # 1) Sensor — gate everything until raw orders land.
    sensor = FileSensor(
        task_id="wait_for_orders",
        filepath=data_dir / "orders.parquet",
        retries=2,
        retry_delay=0.0,
    )

    # 2) ODS — copy raw data into ods schema.
    def ods_orders(context: dict) -> None:
        con = context["con"]
        con.execute("CREATE SCHEMA IF NOT EXISTS ods")
        for p in sorted(data_dir.glob("*.parquet")):
            con.execute(
                "CREATE OR REPLACE TABLE ods." + p.stem + " AS "
                "SELECT * FROM read_parquet('" + p.as_posix() + "')"
            )

    ods = PythonOperator(task_id="ods_orders",
                         python_callable=ods_orders,
                         retries=1)

    # 3) DWD — typed, conformed orders.
    dwd = SqlOperator(
        task_id="dwd_orders",
        sql=(
            "CREATE SCHEMA IF NOT EXISTS dwd;"
            "CREATE OR REPLACE TABLE dwd.orders AS "
            "SELECT order_id, user_id, total, status, "
            "       CAST(order_date AS DATE) AS order_date, order_ts "
            "FROM ods.orders WHERE order_id IS NOT NULL;"
        ),
    )

    # 4) DWS — daily aggregation.
    dws = SqlOperator(
        task_id="dws_orders_daily",
        sql=(
            "CREATE SCHEMA IF NOT EXISTS dws;"
            "CREATE OR REPLACE TABLE dws.orders_daily AS "
            "SELECT order_date, COUNT(*) AS order_cnt, "
            "       SUM(total) AS gmv, "
            "       COUNT(DISTINCT user_id) AS buyer_cnt "
            "FROM dwd.orders GROUP BY order_date;"
        ),
    )

    # 5) ADS — top-of-funnel metric for the dashboard. SLA so slow
    # runs show up in the run summary without aborting.
    ads = SqlOperator(
        task_id="ads_gmv_daily",
        sql=(
            "CREATE SCHEMA IF NOT EXISTS ads;"
            "CREATE OR REPLACE TABLE ads.gmv_daily AS "
            "SELECT order_date, gmv, buyer_cnt, "
            "       ROUND(gmv / NULLIF(buyer_cnt, 0), 2) AS arpu "
            "FROM dws.orders_daily;"
        ),
        sla=timedelta(seconds=2),
    )

    # 6) Marker that fires once the whole pipeline succeeded.
    end = EmptyOperator(task_id="pipeline_done")

    # Wire dependencies: sensor -> ods -> dwd -> dws -> ads -> end
    for t in (sensor, ods, dwd, dws, ads, end):
        dag.add(t)
    dag.set_downstream(sensor.task_id, ods.task_id)
    dag.set_downstream(ods.task_id, dwd.task_id)
    dag.set_downstream(dwd.task_id, dws.task_id)
    dag.set_downstream(dws.task_id, ads.task_id)
    dag.set_downstream(ads.task_id, end.task_id)

    dag.validate()
    return dag


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _make_context(data_dir: Path) -> dict:
    """The shared context dict injected into every operator call."""
    con = duckdb.connect(":memory:")
    con.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for p in sorted(data_dir.glob("*.parquet")):
        con.execute(
            f"CREATE OR REPLACE TABLE ods.{p.stem} AS "
            f"SELECT * FROM read_parquet('{p.as_posix()}')"
        )
    return {"con": con}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run the warehouse DAG against the demo dataset.")
    parser.add_argument("--data-dir", type=Path,
                        default=Path("data") / "small")
    parser.add_argument("--lineage-db", type=Path,
                        default=Path("data") / "scheduler_lineage.sqlite")
    parser.add_argument("--backfill-days", type=int, default=1,
                        help="how many daily runs to simulate")
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)

    logging.basicConfig(level=args.log_level.upper(),
                        format="%(levelname)s %(name)s %(message)s")

    if not args.data_dir.exists():
        print(f"data dir not found: {args.data_dir}", file=sys.stderr)
        return 1

    lineage = LineageTracker(args.lineage_db)
    dag = build_warehouse_dag(args.data_dir, args.lineage_db)
    ctx = _make_context(args.data_dir)

    def provider(task_id: str, scheduled_at: datetime) -> dict:
        return {**ctx, "dag_id": task_id, "scheduled_at": scheduled_at}

    today = date.today()
    start = today - timedelta(days=args.backfill_days - 1)
    runs = dag.backfill(start, today, lineage=lineage,
                        context_provider=provider)

    print(f"DAG {dag.dag_id} ran {len(runs)} scheduled date(s).")
    for run in runs:
        summary = {tid: ti.state.value
                   for tid, ti in run.instances.items()}
        print(f"  {run.scheduled_at.date()} -> {summary}")
    if any(ti.state == TaskState.FAILED
           for run in runs for ti in run.instances.values()):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())