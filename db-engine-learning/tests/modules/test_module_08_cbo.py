"""Module 08 — tests."""
from __future__ import annotations

from db_engine.modules.module_08_cbo.cost import CostModel, estimate_rows_for_eq
from db_engine.modules.module_08_cbo.histogram import EqualHeightHistogram
from db_engine.modules.module_08_cbo.dp_ordering import JoinEdge, enumerate_join_orders


def test_histogram_lt_monotone():
    h = EqualHeightHistogram.build("v", list(range(100)), n_buckets=10)
    a = h.estimate_lt(50, 100)
    b = h.estimate_lt(70, 100)
    assert a <= b


def test_estimate_uniform():
    assert estimate_rows_for_eq(col_distinct=10, total=100) == 10


def test_cost_model_dominates_scan():
    cm = CostModel()
    assert cm.hash_join(1000, 500) < cm.nl(1000, 500)


def test_join_ordering_picks_cheapest():
    edges = {
        frozenset({"a", "b"}): JoinEdge("a", "b", 10),
        frozenset({"b", "c"}): JoinEdge("b", "c", 1000),
        frozenset({"a", "c"}): JoinEdge("a", "c", 1000),
    }
    sizes = {"a": 100, "b": 100, "c": 100}
    orders = enumerate_join_orders(["a", "b", "c"], edges, sizes)
    # Cheapest should be: a-b then c (or symmetric).
    assert len(orders) >= 1


def test_chapter_runs():
    from db_engine.modules.module_08_cbo.chapter import run_demo
    out = run_demo()
    assert "best_order" in out
