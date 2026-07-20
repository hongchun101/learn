"""Module 03 — chapter narrative + run_demo."""
from __future__ import annotations

from db_engine.modules.module_03_mvcc.snapshot import MultiVersionStore


def run_demo() -> dict:
    store = MultiVersionStore()

    # T1 reads at ts=1, T2 writes key=bal at commit ts=2.
    t1 = store.begin()
    t1.put("name", "alice")
    t1_ts = t1.commit()

    t2 = store.begin()
    pre = t2.get("name")
    t2.put("name", "alice2")
    t2_ts = t2.commit()

    # Snapshot read at ts=1 must see "alice", not "alice2".
    t3 = store.begin()
    snap = t3.get("name")

    out = {
        "t1_committed_at": t1_ts,
        "t2_committed_at": t2_ts,
        "t3_snap_view": snap,
        "abort_then_get": None,
    }

    # Aborted write must not be visible.
    t4 = store.begin()
    t4.put("k", "v")
    t4.abort()
    t5 = store.begin()
    out["abort_then_get"] = t5.get("k")
    return out


if __name__ == "__main__":
    import json
    print(json.dumps(run_demo(), indent=2, default=str))
