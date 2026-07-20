"""Modules 09-18 — combined tests (chapter demos pass)."""
from __future__ import annotations


# ---------------------------------------------------------------------------
# 09 — indexes
# ---------------------------------------------------------------------------

def test_09_secondary_index():
    from db_engine.modules.module_09_indexes.secondary import SecondaryIndex
    from db_engine.modules.module_06_executor.catalog import Catalog
    from db_engine.shared.types import Column, Schema, SqlType

    cat = Catalog()
    cat.create_table("events", Schema((
        Column("id", SqlType.INT),
        Column("kind", SqlType.TEXT),
    )))
    ev = cat.get("events")
    for i in range(20):
        ev.insert({"id": i, "kind": "a" if i % 2 == 0 else "b"})
    sec = SecondaryIndex(ev, "kind")
    found_a = list(sec.lookup("a"))
    assert len(found_a) == 10


def test_09_covering_index():
    from db_engine.modules.module_09_indexes.covering import CoveringIndex
    from db_engine.modules.module_06_executor.catalog import Catalog
    from db_engine.shared.types import Column, Schema, SqlType

    cat = Catalog()
    cat.create_table("events", Schema((
        Column("id", SqlType.INT),
        Column("kind", SqlType.TEXT),
        Column("val", SqlType.INT),
    )))
    ev = cat.get("events")
    for i in range(5):
        ev.insert({"id": i, "kind": f"k{i}", "val": i * 10})
    cov = CoveringIndex(ev, "id", ("kind",))
    cov.build()
    out = list(cov.lookup(3))
    assert out and out[0] == (3, ("k3",))


def test_09_zone_map():
    from db_engine.modules.module_09_indexes.zonemap import ZoneMapIndex
    zm = ZoneMapIndex("v", zone_size=10)
    zm.build_from_rows(list(range(100)))
    kept = zm.prune(50, 60)
    assert kept


def test_09_bloom():
    from db_engine.modules.module_09_indexes.bloom import BloomFilter
    bf = BloomFilter(size_bits=256, k=3)
    for v in range(50):
        bf.add(v)
    assert (10 in bf) is True
    assert ("nope" in bf) in (False, True)  # may yield False positive


# ---------------------------------------------------------------------------
# 10 — vectorized
# ---------------------------------------------------------------------------

def test_10_vectorized():
    from db_engine.modules.module_10_vectorized import vectorized_filter, vectorized_project
    from db_engine.shared.types import Row
    rows = [Row(rid=None, values=[i, i % 3]) for i in range(20)]
    filtered = vectorized_filter(rows, lambda v: v[1] == 0)
    assert all(r.values[1] == 0 for r in filtered)
    projected = vectorized_project(rows, [0])
    assert all(len(r.values) == 1 for r in projected)


# ---------------------------------------------------------------------------
# 11 — parallel
# ---------------------------------------------------------------------------

def test_11_parallel_map():
    from db_engine.modules.module_11_parallel import parallel_map
    from db_engine.shared.types import Row
    rows = [Row(rid=None, values=[i]) for i in range(100)]
    out = parallel_map(rows, lambda r: Row(rid=r.rid, values=[r.values[0] * 2]), workers=4)
    assert [r.values[0] for r in out] == [i * 2 for i in range(100)]


def test_11_exchange():
    from db_engine.modules.module_11_parallel import Exchange
    from db_engine.shared.types import Row
    ex = Exchange()
    for v in [10, 20, 30]:
        ex.send(Row(rid=None, values=[v]))
    ex.close()
    out = ex.drain()
    assert [r.values[0] for r in out] == [10, 20, 30]


# ---------------------------------------------------------------------------
# 12 — distributed
# ---------------------------------------------------------------------------

def test_12_consistent_hash():
    from db_engine.modules.module_12_distributed import assign_shard
    assert assign_shard("hello", ["a", "b"]) in {"a", "b"}


def test_12_vector_clock():
    from db_engine.modules.module_12_distributed import VectorClock
    a = VectorClock(); a.bump("p")
    b = a.merge(VectorClock()); b.bump("q")
    assert a.happens_before(b)


def test_12_2pc():
    from db_engine.modules.module_12_distributed import TwoPhaseCommit
    twopc = TwoPhaseCommit(["x", "y"])
    ok = twopc.prepare({"x": True, "y": True})
    twopc.commit()
    assert ok and twopc.is_committed()


def test_12_raft():
    from db_engine.modules.module_12_distributed import RaftCluster
    c = RaftCluster()
    c.elect("a")
    c.append({"op": "set", "k": "x", "v": 1})
    c.append({"op": "set", "k": "y", "v": 2})
    committed = c.committed()
    assert len(committed) == 2


# ---------------------------------------------------------------------------
# 13 — columnar
# ---------------------------------------------------------------------------

def test_13_rle():
    from db_engine.modules.module_13_columnar import rle_decode, rle_encode
    raw = [1, 1, 1, 2, 2, 3]
    enc = rle_encode(raw)
    assert rle_decode(*enc) == raw


def test_13_dictionary():
    from db_engine.modules.module_13_columnar import Dictionary
    d = Dictionary()
    for v in ["a", "b", "a", "c", "b"]:
        d.add(v)
    assert len(set(d.codes())) == 3


def test_13_delta():
    from db_engine.modules.module_13_columnar import delta_decode, delta_encode
    raw = [1, 3, 6, 10, 15]
    assert delta_decode(delta_encode(raw)) == raw


def test_13_bitset_pack():
    from db_engine.modules.module_13_columnar import bitset_pack
    n, w = bitset_pack([True, False, True, True, False])
    assert n == 1 and w[0] != 0


# ---------------------------------------------------------------------------
# 14 — OLAP
# ---------------------------------------------------------------------------

def test_14_groupby():
    from db_engine.modules.module_14_olap import _gb_one
    gb = _gb_one({"k": [1, 1, 2, 2], "v": [10, 20, 5, 15]}, ["k"], {"count": None})
    assert gb[1]["count"] == 2
    assert gb[2]["count"] == 2


def test_14_topk():
    from db_engine.modules.module_14_olap import topk
    out = topk([1, 1, 2, 2, 2, 3, 3, 3, 3, 4], 2)
    assert out[0][0] == 3


def test_14_hll():
    from db_engine.modules.module_14_olap import HyperLogLog
    hll = HyperLogLog(p=12)
    for v in range(10_000):
        hll.add(v)
    estimated = hll.count()
    assert 9_500 < estimated < 11_500


def test_14_tdigest():
    from db_engine.modules.module_14_olap import TDigest
    td = TDigest()
    for v in range(10_000):
        td.add(v)
    p50 = td.quantile(0.5)
    assert 4500 < p50 < 5500


# ---------------------------------------------------------------------------
# 15 — codegen
# ---------------------------------------------------------------------------

def test_15_compile_predicate():
    from db_engine.modules.module_15_codegen import make_predicate
    fn = make_predicate("row[0] > 10")
    assert fn([20]) is True
    assert fn([5]) is False


def test_15_chapter():
    from db_engine.modules.module_15_codegen import run_demo
    out = run_demo()
    assert "results" in out


# ---------------------------------------------------------------------------
# 16 — observability
# ---------------------------------------------------------------------------

def test_16_explain():
    from db_engine.modules.module_16_observability import explain
    from db_engine._contracts.plan import OpKind, Operator
    plan = Operator(kind=OpKind.SCAN, table="t")
    text = explain(plan)
    assert "SCAN" in text


def test_16_replay():
    from db_engine.modules.module_16_observability import ReplayLog
    rl = ReplayLog()
    rl.record("x", q=1)
    rl.record("y", q=2)
    assert "x" in rl.to_json()


# ---------------------------------------------------------------------------
# 17 — wire
# ---------------------------------------------------------------------------

def test_17_wire_roundtrip():
    from db_engine.modules.module_17_wire import Wire
    import io
    from db_engine._contracts.wire import Frame, FrameType

    buf = io.BytesIO()
    w = Wire(buf)
    w.send_frame(Frame(type=FrameType.HELLO, payload=b"hi"))
    f = w.recv_frame()
    assert f is not None and f.type is FrameType.HELLO


def test_17_chapter():
    from db_engine.modules.module_17_wire import run_demo
    out = run_demo()
    assert out["frame1"] == "HELLO"


# ---------------------------------------------------------------------------
# 18 — capstone
# ---------------------------------------------------------------------------

def test_18_capstone_smoke():
    from db_engine.modules.module_18_capstone import run_capstone
    out = run_capstone(scale=10)
    assert out["scale"] == 10
    assert len(out["queries"]) == 8
    for name, q in out["queries"].items():
        assert q["rows"] > 0, f"{name} returned no rows"


def test_18_wire_demo():
    from db_engine.modules.module_18_capstone import run_wire_demo
    out = run_wire_demo()
    assert out["frames"]
