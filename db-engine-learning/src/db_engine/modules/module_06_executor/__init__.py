"""Module 06 — volcano executor + catalog.

The executor is what actually produces rows. It implements the
shared `Executor` contract and is reused by every later chapter.

Conventions:
- Operators are pull-style: `open() / next() / close()`.
- A `Catalog` holds schemas and small in-memory row stores; module
  06 ships a tiny row store; module 18 swaps in the MVCC store.
"""
from __future__ import annotations

from db_engine.modules.module_06_executor.catalog import Catalog
from db_engine.modules.module_06_executor.operators import Executor, run_operator, evaluate
from db_engine.modules.module_06_executor.expressions import eval_expr

__all__ = ["Catalog", "Executor", "run_operator", "eval_expr", "evaluate"]
