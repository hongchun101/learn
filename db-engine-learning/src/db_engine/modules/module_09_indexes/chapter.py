"""Module 09 — chapter."""
from __future__ import annotations

import json

from db_engine.modules.module_06_executor.catalog import Catalog
from db_engine.modules.module_09_indexes.bloom import BloomFilter
from db_engine.modules.module_09_indexes.covering import CoveringIndex
from db_engine.modules.module_09_indexes.secondary import SecondaryIndex
from db_engine.modules.module_09_indexes.zonemap import ZoneMapIndex
from db_engine.shared.types import Column, Schema, SqlType


def make_catalog() -> Catalog:
    cat = Catalog()
    cat.create_table("events", Schema((
        Column("id", SqlType.INT),
        Column("kind", SqlType.TEXT),
        Column("val", SqlType.INT),
    )))
    ev = cat.get("events")
    for i in range(100):
        ev.insert({"id": i, "kind": "a" if i % 2 == 0 else "b", "val": i * 3})
    return cat


def run_demo() -> dict:
    cat = make_catalog()
    ev = cat.get("events")
    sec = SecondaryIndex(ev, "kind")
    found = list(sec.lookup("a"))
    range_q = list(sec.range_scan("a", "b"))

    cover = CoveringIndex(ev, key_column="id", included=("kind",))
    cover.build()
    covering = list(cover.lookup(0))

    zm = ZoneMapIndex("val", zone_size=10)
    zm.build_from_rows([r["val"] for r in ev.rows])
    pruned = zm.prune(50, 150)

    bf = BloomFilter(size_bits=1024, k=4)
    for r in ev.rows:
        bf.add(r["kind"])
    bloom_a = "a" in bf
    bloom_absent = "z" in bf

    return {
        "indexed_kind_a_n": len(found),
        "range_kind": len(range_q),
        "covering_first": covering[0] if covering else None,
        "zones_total": len(zm.zones),
        "zones_after_prune": len(pruned),
        "bloom_a": bloom_a,
        "bloom_absent": bloom_absent,
    }


if __name__ == "__main__":
    print(json.dumps(run_demo(), indent=2, default=str))
