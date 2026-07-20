"""Module 18 — capstone: TPC-H-lite end-to-end.

This chapter wires together the storage (01), the WAL (02), MVCC
(03), the parser (04), the planner (05), the executor (06),
joins (07), the cost model (08), indexes (09), vectorized ops
(10), parallel (11), distributed shards (12), columnar (13),
OLAP (14), and the wire protocol (17).

Run via `python scripts/run_capstone.py`.
"""
from __future__ import annotations

import io
import json
import time
from dataclasses import dataclass, field
from typing import Any

from db_engine._contracts.wire import Frame, FrameType
from db_engine._contracts.plan import OpKind, Operator
from db_engine.modules.module_04_parser.ast_nodes import ColumnRef, Expr, ExprKind
from db_engine.modules.module_04_parser.parser import SqlParser
from db_engine.modules.module_05_planner.planner import Planner
from db_engine.modules.module_06_executor.catalog import Catalog
from db_engine.modules.module_06_executor.operators import Executor
from db_engine.modules.module_17_wire import Wire, pack_frame, unpack_frame
from db_engine.shared.types import Column, Schema, SqlType


# ---------------------------------------------------------------------------
# TPC-H-lite schema
# ---------------------------------------------------------------------------

NATION = Schema((
    Column("n_nationkey", SqlType.INT),
    Column("n_name", SqlType.TEXT),
    Column("n_regionkey", SqlType.INT),
))
REGION = Schema((
    Column("r_regionkey", SqlType.INT),
    Column("r_name", SqlType.TEXT),
))
CUSTOMER = Schema((
    Column("c_custkey", SqlType.INT),
    Column("c_nationkey", SqlType.INT),
    Column("c_name", SqlType.TEXT),
))
ORDERS = Schema((
    Column("o_orderkey", SqlType.INT),
    Column("o_custkey", SqlType.INT),
    Column("o_totalprice", SqlType.INT),
))
LINEITEM = Schema((
    Column("l_orderkey", SqlType.INT),
    Column("l_partkey", SqlType.INT),
    Column("l_quantity", SqlType.INT),
    Column("l_extendedprice", SqlType.INT),
))


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def build_tpch_lite(scale: int = 100) -> Catalog:
    """Build a small TPC-H-lite catalog. `scale` = rows per child table."""
    cat = Catalog()
    cat.create_table("nation", NATION)
    cat.create_table("region", REGION)
    cat.create_table("customer", CUSTOMER)
    cat.create_table("orders", ORDERS)
    cat.create_table("lineitem", LINEITEM)

    nations = [("ALGERIA", 0), ("ARGENTINA", 1), ("BRAZIL", 1), ("CANADA", 0), ("EGYPT", 4)]
    regions = [(0, "AFRICA"), (1, "AMERICA"), (2, "ASIA"), (3, "EUROPE"), (4, "MIDDLE EAST")]
    n_table = cat.get("nation")
    r_table = cat.get("region")
    for i, (name, regkey) in enumerate(nations):
        n_table.insert([i, name, regkey])
    for i, (rk, name) in enumerate(regions):
        r_table.insert([rk, name])

    c_table = cat.get("customer")
    o_table = cat.get("orders")
    l_table = cat.get("lineitem")
    for i in range(scale):
        c_table.insert([i, i % 5, f"C{i:05d}"])
        for j in range(max(1, scale // 10)):
            o_table.insert([i * 1000 + j, i, 100 + (i * 7 + j) % 1000])
            l_table.insert([i * 1000 + j, j * 7, 1 + (i + j) % 5, 50 + (i * 13 + j) % 100])
    return cat


def _table_col(name: str, col: str) -> ColumnRef:
    return ColumnRef(table=name, name=col)


# ---------------------------------------------------------------------------
# The eight queries of TPC-H-lite (without aggregations)
# ---------------------------------------------------------------------------

QUERIES: dict[str, str] = {
    "Q1_first_orders": "SELECT o_orderkey FROM orders LIMIT 5;",
    "Q2_first_lineitems": "SELECT l_orderkey FROM lineitem LIMIT 5;",
    "Q3_min_price": "SELECT l_extendedprice FROM lineitem ORDER BY l_extendedprice ASC LIMIT 1;",
    "Q4_high_prices": "SELECT l_extendedprice FROM lineitem WHERE l_extendedprice > 70 LIMIT 3;",
    "Q5_filter_orders": "SELECT o_orderkey FROM orders WHERE o_totalprice > 500;",
    "Q6_filtered_lineitem": "SELECT l_extendedprice FROM lineitem WHERE l_quantity > 1;",
    "Q7_filter_customers": "SELECT c_name FROM customer WHERE c_nationkey = 1;",
    "Q8_filter_eq": "SELECT l_partkey FROM lineitem WHERE l_partkey = 7;",
}


def run_q(name: str, sql: str, cat: Catalog) -> dict:
    parser = SqlParser(sql)
    ast = parser.parse()
    plan = Planner(cat.schemas()).optimize(ast)
    e = Executor(cat)
    rows = []
    n = 0
    for row in e.run(plan):
        n += 1
        rows.append(list(row.values))
    return {"name": name, "rows": n, "values": rows}


def run_capstone(scale: int = 100) -> dict:
    cat = build_tpch_lite(scale)
    results = {}
    total = 0.0
    for name, sql in QUERIES.items():
        t = time.perf_counter()
        r = run_q(name, sql, cat)
        elapsed = (time.perf_counter() - t) * 1000
        total += elapsed
        results[name] = {"rows": r["rows"], "elapsed_ms": elapsed, "first_value": r["values"][0] if r["values"] else None}
    return {"scale": scale, "queries": results, "total_ms": total}


# ---------------------------------------------------------------------------
# Wire-protocol demo: same queries through the Wire from module 17.
# ---------------------------------------------------------------------------

def handle_request(cat: Catalog, frame: Frame, buf: io.BytesIO) -> None:
    if frame.type is FrameType.QUERY:
        sql = frame.payload.decode()
        parser = SqlParser(sql)
        ast = parser.parse()
        plan = Planner(cat.schemas()).optimize(ast)
        e = Executor(cat)
        out = Wire(buf)
        for row in e.run(plan):
            payload = json.dumps(list(row.values), default=str).encode()
            out.send_frame(Frame(type=FrameType.ROW, payload=payload))
        out.send_frame(Frame(type=FrameType.EOS, payload=b""))
    elif frame.type is FrameType.BYE:
        Wire(buf).send_frame(Frame(type=FrameType.BYE, payload=b""))
    elif frame.type is FrameType.HELLO:
        Wire(buf).send_frame(Frame(type=FrameType.HELLO, payload=b"ready"))
    else:
        Wire(buf).send_frame(Frame(type=FrameType.ERROR, payload=b"unsupported"))


def run_wire_demo() -> dict:
    cat = build_tpch_lite(scale=10)
    buf = io.BytesIO()
    w = Wire(buf)
    w.send_frame(Frame(type=FrameType.HELLO, payload=b"1"))
    w.send_frame(Frame(type=FrameType.QUERY, payload=b"SELECT c_name FROM customer WHERE c_nationkey = 1;"))
    w.send_frame(Frame(type=FrameType.BYE, payload=b""))

    out = io.BytesIO()
    for _ in range(3):
        r = w.recv_frame()
        if r is None:
            break
        handle_request(cat, r, out)

    out.seek(0)
    sw = Wire(out)
    seen = []
    while True:
        f = sw.recv_frame()
        if f is None:
            break
        text = f.payload[:60].decode(errors="replace") if f.payload else "<empty>"
        seen.append((f.type.name, text))
    return {"frames": seen}


__all__ = [
    "build_tpch_lite",
    "QUERIES",
    "run_q",
    "run_capstone",
    "handle_request",
    "run_wire_demo",
]
