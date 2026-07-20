"""db_engine — from-0-to-expert curriculum on database engine internals.

The public surface is intentionally small. Chapter internals live under
`db_engine.modules.*`. The shared contracts live under
`db_engine._contracts.*`.
"""
from __future__ import annotations

from db_engine.shared import types
from db_engine.shared import error
from db_engine.shared import util

__all__ = ["types", "error", "util"]
__version__ = "0.1.0"
