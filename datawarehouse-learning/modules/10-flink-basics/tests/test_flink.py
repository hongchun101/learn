"""Tests for the Flink-style stream simulation primitives.

We import the implementation directly from the module's src/ directory,
since the demonstration is a self-contained pure-Python module that
does not need SQL or DuckDB.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Path layout (from the test file):
#   modules/10-flink-basics/tests/test_flink.py
#   parents[0] = tests/        parents[1] = 10-flink-basics/
#   parents[2] = modules/      parents[3] = datawarehouse-learning/
ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "modules" / "10-flink-basics" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from flink_stream_demo import (  # noqa: E402  pylint: disable=wrong-import-position
    Event,
    Window,
    Watermarks,
    assign_session,
    assign_sliding,
    assign_tumbling,
    aggregate,
    handle_late,
    key_by,
    run_pipeline,
)


# ---------------------------------------------------------------------------
# Fixtures — small, controlled event streams that exercise edge cases.
# ---------------------------------------------------------------------------


@pytest.fixture()
def steady_events() -> list[Event]:
    """Three keys x 20 timestamps (t=0..19), each event payload=1.0."""
    return [
        Event(key=k, event_time=float(t), payload=1.0)
        for k in (1, 2, 3)
        for t in range(0, 20)
    ]


@pytest.fixture()
def late_event() -> Event:
    return Event(key=1, event_time=4.5, payload=99.0)


# ---------------------------------------------------------------------------
# Test 1 — tumbling window aggregates are non-overlapping and cover all events
# ---------------------------------------------------------------------------


def test_tumbling_window_partitions_events(steady_events):
    """Every event falls in exactly one tumbling window; per-window
    payload sum equals event-count-per-window (payload is 1.0)."""
    wins = assign_tumbling(steady_events, size=5.0)

    # t in [0, 20) with size 5 -> 4 buckets: [0,5), [5,10), [10,15), [15,20).
    assert len(wins) == 4
    aggregated = aggregate(wins, sum)
    for w, total in aggregated.items():
        # 3 keys x 5 timestamps per window = 15.
        assert total == 15.0, f"window {w} should sum to 15, got {total}"

    starts = sorted(w.start for w in aggregated)
    # Windows must be contiguous (no gaps) and ordered.
    for a, b in zip(starts, starts[1:]):
        assert b - a == 5.0


# ---------------------------------------------------------------------------
# Test 2 — sliding window produces overlapping windows with right density
# ---------------------------------------------------------------------------


def test_sliding_window_overlaps():
    """With size=5 and slide=2, every event lands in multiple windows
    so summed payloads exceed the raw event count."""
    evs = [
        Event(key=k, event_time=float(t), payload=1.0)
        for k in (1, 2)
        for t in range(0, 10)
    ]  # 20 events

    wins = assign_sliding(evs, size=5.0, slide=2.0)
    agg = aggregate(wins, sum)

    # With size=5/slide=2 over t in [0,10) the distinct window starts
    # that overlap some event are 0, 2, 4, 6, 8 -> 5 windows total.
    assert len(agg) == 5

    # Sliding windows replicate each event into multiple windows, so
    # the summed payload across all windows is strictly > 20 (the raw
    # event count).
    total = sum(agg.values())
    assert total > 20


# ---------------------------------------------------------------------------
# Test 3 — session window merges close events, splits far ones
# ---------------------------------------------------------------------------


def test_session_window_merges_and_splits():
    """Sessions merge events within `gap`, but split when gap exceeded."""
    evs = [
        Event(key=1, event_time=0.0, payload=1.0),
        Event(key=1, event_time=1.0, payload=1.0),   # inside gap -> same session
        Event(key=1, event_time=2.5, payload=1.0),   # gap=1.5 from prev -> split
        Event(key=1, event_time=3.0, payload=1.0),   # inside gap -> same as 2.5
        Event(key=1, event_time=10.0, payload=1.0),  # huge gap -> new session
    ]
    wins = assign_session(evs, gap=1.5)
    agg = aggregate(wins, sum)

    # Three sessions expected: {0,1}, {2.5,3}, {10}.
    assert len(agg) == 3
    counts = sorted(v for v in agg.values())
    assert counts == [1.0, 2.0, 2.0]

    # The first session should start at event_time=0 with two members.
    first_window = min(agg, key=lambda w: w.start)
    assert first_window.start == 0.0
    assert agg[first_window] == 2.0


# ---------------------------------------------------------------------------
# Test 4 — watermark advances but absorbs late events
# ---------------------------------------------------------------------------


def test_watermark_advances_then_ignores_late_events(late_event):
    """The watermark tracks max(event_time) - max_out_of_orderness and
    emits nothing when a late event arrives; handle_late respects
    strategy='drop' vs 'update'."""
    wm = Watermarks(max_out_of_orderness=2.0)

    # Feed an ordered stream first.
    ordered = [
        Event(key=1, event_time=1.0, payload=1.0),
        Event(key=1, event_time=5.0, payload=1.0),
        Event(key=1, event_time=10.0, payload=1.0),
    ]
    watermarks = [wm.on_event(e.event_time) for e in ordered]
    assert watermarks[0] is not None                        # first event produces one
    assert watermarks[0].timestamp == pytest.approx(-1.0)
    assert watermarks[1].timestamp == pytest.approx(3.0)
    assert watermarks[2].timestamp == pytest.approx(8.0)

    # A late event arrives - watermark must NOT regress or re-emit.
    late = wm.on_event(late_event.event_time)               # event_time=4.5
    assert late is None                                     # dropped because 4.5 < current max
    assert wm.current.timestamp == pytest.approx(8.0)

    # Late-event handler: drop vs. update mutate windows differently.
    base = [Event(key=1, event_time=float(t), payload=1.0) for t in range(0, 8)]
    wins_before = assign_tumbling(base, size=5.0)
    agg_before = aggregate(wins_before, sum)
    # Window [0,5) had 5 events pre-late-arrival.
    assert agg_before[Window(0.0, 5.0)] == 5.0

    after, stats = handle_late(
        {w: list(es) for w, es in wins_before.items()},
        [late_event],
        watermark_ts=8.0,
        strategy="drop",
    )
    agg_after = aggregate(after, sum)
    assert agg_after[Window(0.0, 5.0)] == 5.0              # unchanged
    assert stats.late_dropped >= 1
    assert stats.on_time >= 1

    after_upd, stats_upd = handle_late(
        {w: list(es) for w, es in wins_before.items()},
        [late_event],
        watermark_ts=8.0,
        strategy="update",
    )
    agg_upd = aggregate(after_upd, sum)
    # late_event.payload = 99.0, so [0,5) grows from 5 -> 5 + 99 = 104.
    assert agg_upd[Window(0.0, 5.0)] == 104.0
    assert stats_upd.late_updated >= 1


# ---------------------------------------------------------------------------
# Bonus — key_by partitions the stream and the end-to-end pipeline works
# ---------------------------------------------------------------------------


def test_key_by_partitions_and_pipeline_runs(steady_events):
    """Group-by-key must yield one bucket per key; the pipeline
    should return a WindowResult whose payload reflects sliding-window
    duplication of events (sum > total event count)."""
    buckets = key_by(steady_events)
    assert set(buckets) == {1, 2, 3}
    for k, evs in buckets.items():
        assert len(evs) == 20

    result = run_pipeline(steady_events, window_type="sliding",
                          size=5.0, slide=2.0)
    assert result.window_type == "sliding"
    # 60 events spread across sliding windows — each event is counted
    # in multiple windows, so the sum of window payloads > 60.
    total = sum(result.payload.values())
    assert total > 60
