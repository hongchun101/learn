"""Module 08 — chapter."""
from __future__ import annotations

import json

from db_engine.modules.module_06_executor.catalog import Catalog
from db_engine.modules.module_08_cbo.stats import TableStats
from db_engine.modules.module_08_cbo.histogram import EqualHeightHistogram
from db_engine.modules.module_08_cbo.cost import CostModel
from db_engine.modules.module_08_cbo.dp_ordering import JoinEdge, enumerate_join_orders
from db_engine.shared.types import Column, Schema, SqlType


def make_catalog() -> Catalog:
    cat = Catalog()
    cat.create_table("a", Schema((Column("id", SqlType.INT), Column("v", SqlType.INT))))
    cat.create_table("b", Schema((Column("id", SqlType.INT), Column("v", SqlType.INT))))
    cat.create_table("c", Schema((Column("id", SqlType.INT), Column("v", SqlType.INT))))
    a = cat.get("a")
    b = cat.get("b")
    c = cat.get("c")
    for i in range(1000):
        a.insert({"id": i, "v": i % 10})
        b.insert({"id": i * 2, "v": i % 3})
        c.insert({"id": i * 3, "v": i % 5})
    return cat


def run_demo() -> dict:
    cat = make_catalog()
    stats_a = TableStats.from_table(cat.get("a"))
    stats_b = TableStats.from_table(cat.get("b"))
    stats_c = TableStats.from_table(cat.get("c"))
    hg = EqualHeightHistogram.build("v", [r["v"] for r in cat.get("a").rows], n_buckets=10)

    edges = {
        frozenset({"a", "b"}): JoinEdge(left="a", right="b", cost=1000 * 100),
        frozenset({"b", "c"}): JoinEdge(left="b", right="c", cost=1000 * 1),
        frozenset({"a", "c"}): JoinEdge(left="a", right="c", cost=1000 * 100),
    }
    sizes = {"a": 1000, "b": 2000, "c": 3000}
    orders = enumerate_join_orders(["a", "b", "c"], edges, sizes)

    cm = CostModel()
    return {
        "a_distinct_v": stats_a.columns["v"].distinct,
        "b_distinct_v": stats_b.columns["v"].distinct,
        "hist_lt_5": hg.estimate_lt(5, 1000),
        "best_order": orders[0],
        "alt_orders": orders[1:3],
        "cost_scan": cm.scan(1000, 100),
        "cost_hash": cm.hash_join(1000, 2000),
    }


if __name__ == "__main__":
    print(json.dumps(run_demo(), indent=2, default=str))
