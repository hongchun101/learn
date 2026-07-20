"""Module 03 — MVCC + snapshot isolation.

Exposes:
- `MultiVersionStore` + `MVTransaction` (snapshot-isolation MVCC)
- `SerializabilityTracker` (SSI conflict-graph check)

The Snapshot contract (`db_engine._contracts.snapshot`) is satisfied by
`MVTransaction`.
"""
from __future__ import annotations

from db_engine.modules.module_03_mvcc.version_chain import Version
from db_engine.modules.module_03_mvcc.snapshot import MultiVersionStore, MVTransaction
from db_engine.modules.module_03_mvcc.ssi import SerializabilityTracker

__all__ = ["MultiVersionStore", "MVTransaction", "Version", "SerializabilityTracker"]
