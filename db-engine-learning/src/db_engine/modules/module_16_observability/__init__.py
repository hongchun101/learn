"""Module 16 — observability: EXPLAIN, per-stage metrics, replays.

What's inside:
- `metrics.py` — per-op counters (rows_in, rows_out, ns, etc.)
- `explain.py` — pretty-print an operator tree
- `replay.py` — record inputs to a query and replay deterministically
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from db_engine._contracts.plan import OpKind, Operator


@dataclass(slots=True)
class OpMetrics:
    name: str
    rows_in: int = 0
    rows_out: int = 0
    time_ns: int = 0
    open_ns: int = 0
    next_ns: int = 0
    close_ns: int = 0


@dataclass(slots=True)
class Trace:
    ops: dict[str, OpMetrics] = field(default_factory=dict)

    def add(self, op_name: str) -> "OpProfiler":
        m = self.ops.setdefault(op_name, OpMetrics(name=op_name))
        return OpProfiler(m)


@dataclass(slots=True)
class OpProfiler:
    metric: OpMetrics
    t0: int = 0

    def __enter__(self):
        self.t0 = time.perf_counter_ns()
        return self

    def __exit__(self, *args):
        self.metric.time_ns += time.perf_counter_ns() - self.t0


def explain(plan: Operator, indent: int = 0) -> str:
    pad = "  " * indent
    out = f"{pad}{plan.kind.name}"
    if plan.table:
        out += f"({plan.table})"
    if plan.predicate is not None:
        out += f"  [pred={explain_expr(plan.predicate)}]"
    if plan.args:
        for k, v in plan.args.items():
            out += f"  {k}={v!r}"
    out += "\n"
    for c in plan.children:
        out += explain(c, indent + 1)
    return out


def explain_expr(expr) -> str:
    if hasattr(expr, "kind"):
        kind = expr.kind
        value = expr.value
        op = expr.op
        args = expr.args
        if hasattr(kind, "value"):
            return f"{kind.value}({value!r}, {op!r}, {tuple(explain_expr(a) for a in args)})"
        return f"{kind}({value!r}, {op!r}, {tuple(explain_expr(a) for a in args)})"
    return repr(expr)


@dataclass(slots=True)
class ReplayLog:
    """A deterministic replay log: each entry is `{"event":..., "args":...}`."""
    events: list[dict] = field(default_factory=list)

    def record(self, event: str, **kwargs):
        self.events.append({"event": event, **kwargs})

    def to_json(self) -> str:
        return json.dumps(self.events, default=str)


def run_demo() -> dict:
    from db_engine.modules.module_04_parser.ast_nodes import ExprKind

    scan = Operator(kind=OpKind.SCAN, table="t")
    filt = Operator(
        kind=OpKind.FILTER,
        predicate=ExprKind,
        children=(scan,),
    )
    out = explain(scan)
    trace = Trace()
    p = trace.add("SCAN")
    with p:
        rows_out = 100
    p.metric.rows_out = rows_out
    return {
        "explain_sample": out,
        "trace_metric": asdict(p.metric),
    }


__all__ = ["OpMetrics", "Trace", "OpProfiler", "explain", "explain_expr", "ReplayLog", "run_demo"]
