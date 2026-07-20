"""Module 06 — chapter + run_demo()."""
from __future__ import annotations

import json

from db_engine._contracts.plan import OpKind
from db_engine.modules.module_04_parser.parser import SqlParser
from db_engine.modules.module_05_planner.planner import Planner
from db_engine.modules.module_06_executor.catalog import Catalog
from db_engine.modules.module_06_executor.operators import Executor
from db_engine.shared.types import Column, Schema, SqlType


def setup_catalog() -> Catalog:
    cat = Catalog()
    cat.create_table(
        "orders",
        Schema((
            Column("id", SqlType.INT),
            Column("name", SqlType.TEXT),
            Column("price", SqlType.INT),
        )),
    )
    cat.get("orders").insert({"id": 1, "name": "alice", "price": 12})
    cat.get("orders").insert({"id": 2, "name": "bob", "price": 5})
    cat.get("orders").insert({"id": 3, "name": "carol", "price": 30})
    cat.get("orders").insert({"id": 4, "name": "alice", "price": 50})
    return cat


def run_demo() -> dict:
    cat = setup_catalog()
    parser = SqlParser("SELECT name, price FROM orders WHERE price > 10 ORDER BY price DESC LIMIT 2;")
    ast = parser.parse()
    plan = Planner(cat.schemas()).optimize(ast)

    e = Executor(cat)
    rows = []
    for row in e.run(plan):
        rows.append({"name": row.values[0], "price": row.values[1]})
    return {"rows": rows}


if __name__ == "__main__":
    print(json.dumps(run_demo(), indent=2, default=str))
