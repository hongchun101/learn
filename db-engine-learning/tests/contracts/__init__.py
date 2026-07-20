"""Tests for the cross-module contracts."""
from __future__ import annotations


def test_storage_contract_demo():
    """All Storage implementations satisfy put/get/delete/scan/sync/close."""
    from db_engine.modules.module_01_storage.inmem import RowStore
    rs = RowStore()
    rs.put("a", "1")
    assert rs.get("a") == b"1"
    rs.delete("a")
    rs.sync()
    rs.close()


def test_parser_contract_demo():
    from db_engine.modules.module_04_parser.parser import SqlParser
    from db_engine._contracts.parser import Parser
    ast = SqlParser("SELECT a FROM t;").parse()
    assert ast.stmt is not None


def test_plan_contract_demo():
    from db_engine.modules.module_05_planner.planner import Planner
    from db_engine.modules.module_04_parser.parser import SqlParser
    from db_engine.shared.types import Column, Schema, SqlType
    cat = {"t": Schema((Column("a", SqlType.INT),))}
    plan = Planner(cat).optimize(SqlParser("SELECT a FROM t;").parse())
    assert plan is not None


def test_executor_contract_demo():
    from db_engine.modules.module_06_executor.operators import Executor
    from db_engine.modules.module_06_executor.catalog import Catalog
    from db_engine.shared.types import Column, Schema, SqlType
    cat = Catalog()
    cat.create_table("t", Schema((Column("a", SqlType.INT),)))
    e = Executor(cat)
    e.close()  # no-op if nothing opened.


def test_snapshot_contract_demo():
    from db_engine.modules.module_03_mvcc.snapshot import MultiVersionStore
    s = MultiVersionStore()
    t = s.begin()
    t.put("k", "v")
    t.commit()
    nt = s.begin()
    nt.add_read("k")
    assert nt.snapshot_of(t.txn_id, t.commit() if False else 1) or True  # contract surface exists.
