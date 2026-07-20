"""Module 05 — chapter."""
from __future__ import annotations

import json

from db_engine._contracts.plan import OpKind
from db_engine.modules.module_04_parser.parser import SqlParser
from db_engine.modules.module_05_planner.planner import Planner
from db_engine.modules.module_05_planner.rules import predicate_pushdown, simplify_predicate
from db_engine.shared.types import Column, Schema, SqlType


def run_demo() -> dict:
    catalog = {
        "orders": Schema((
            Column(name="id", sql_type=SqlType.INT),
            Column(name="name", sql_type=SqlType.TEXT),
            Column(name="price", sql_type=SqlType.INT),
        )),
    }
    parser = SqlParser("SELECT name FROM orders WHERE price > 10;")
    ast = parser.parse()
    plan = Planner(catalog).optimize(ast)

    pushed = predicate_pushdown(plan)

    simplified = simplify_predicate(plan.predicate)  # type: ignore[union-attr]

    return {
        "root_kind": plan.kind.name,
        "pushed_kind": pushed.kind.name,
        "child_kind": plan.children[0].kind.name if plan.children else None,
        "simplified": simplified,
    }


if __name__ == "__main__":
    print(json.dumps(run_demo(), indent=2, default=str))
