"""The eight cross-module contracts.

Every chapter implements — or depends on — one or more of these. The
capstone composes all eight.

- Storage              : put / get / delete / scan
- Transaction          : begin / commit / abort
- Snapshot             : reads-as-of ts + conflict-detection on commit
- Parser               : SQL string → AST
- Plan                 : AST → physical operator tree
- Executor             : operator tree → rows
- Stats                : per-column histograms
- Wire                 : frame-based request/response
"""
from __future__ import annotations

from db_engine._contracts.storage import Storage
from db_engine._contracts.transaction import Transaction, TxnStatus
from db_engine._contracts.snapshot import Snapshot
from db_engine._contracts.parser import Parser
from db_engine._contracts.plan import Plan, Operator
from db_engine._contracts.executor import Executor
from db_engine._contracts.stats import Stats, Histogram
from db_engine._contracts.wire import Wire

__all__ = [
    "Storage",
    "Transaction",
    "TxnStatus",
    "Snapshot",
    "Parser",
    "Plan",
    "Operator",
    "Executor",
    "Stats",
    "Histogram",
    "Wire",
]
