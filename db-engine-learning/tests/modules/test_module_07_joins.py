"""Module 07 — tests."""
from __future__ import annotations


def test_chapter_demo_runs():
    from db_engine.modules.module_07_joins.chapter import run_demo
    out = run_demo()
    # All three joins must succeed and return rows.
    for kind, rows in out.items():
        assert rows, f"{kind} returned no rows"
