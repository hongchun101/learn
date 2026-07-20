"""Module 04 — chapter."""
from __future__ import annotations

import json

from db_engine.modules.module_04_parser.parser import SqlParser


def run_demo() -> dict:
    parser = SqlParser(
        "SELECT name, price FROM orders AS o "
        "WHERE price > 10 AND name = 'x' "
        "GROUP BY name "
        "ORDER BY price DESC LIMIT 5;"
    )
    ast = parser.parse()
    sel = ast.stmt
    return {
        "columns": [(c.kind, str(c.value), c.op) for c in sel.columns],
        "from": (sel.from_.table, sel.from_.alias),
        "where_kind": str(sel.where.kind) if sel.where else None,
        "where_op": sel.where.op if sel.where else None,
        "group_by_n": len(sel.group_by),
        "having_op": sel.having.op if sel.having else None,
        "order_by_n": len(sel.order_by),
        "limit": sel.limit,
    }


if __name__ == "__main__":
    print(json.dumps(run_demo(), indent=2, default=str))
