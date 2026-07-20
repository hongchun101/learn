"""Flink-style stream processing primitives in pure Python.

This module reproduces a small, deterministic subset of Apache Flink's
DataStream API semantics so the same window/watermark logic can be
exercised in a notebook or unit test without spinning up a JobManager
or a distributed cluster.

Concepts simulated:
- Event time vs processing time
- Watermarks with bounded out-of-orderness
- Tumbling (fixed) windows, sliding windows, session windows
- Late events handling (drop vs update side-output)
- Per-key state aggregation on top of a keyed stream partition

The implementation is intentionally explicit so each step mirrors the
real Flink operator chain:

    Source  ->  Timestamps  ->  Watermark assigner
             ->  KeyBy  ->  Window  ->  Aggregate  ->  Sink

Only `dataclasses` and the standard library are used. No third-party
streaming engine is required.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Iterable, Iterator, Sequence


# ---------------------------------------------------------------------------
# 1. Event model
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Event:
    """A single record on the stream.

    `event_time` is what Flink calls the *event timestamp* (the moment
    recorded by the producer); `processing_time` is when our mini-runtime
    observed the record. In real Flink both are deeply intertwined via
    `TimeCharacteristic`, here we keep them separate fields for clarity.
    """

    key: int
    event_time: float           # unix epoch seconds, the event time
    payload: float = 1.0        # numeric value to aggregate (e.g. amount)
    processing_time: float = 0.0


@dataclass(slots=True)
class Watermark:
    """A watermark = "no event with timestamp <= this should arrive later".

    Real Flink emits watermarks per subtask through the network channel;
    our single-process runtime walks a monotonic clock.
    """

    timestamp: float

    def __lt__(self, other: "Watermark") -> bool:  # pragma: no cover - trivial
        return self.timestamp < other.timestamp

    def __repr__(self) -> str:
        return f"Watermark({self.timestamp:.3f})"


# ---------------------------------------------------------------------------
# 2. Source + timestamp assignment
# ---------------------------------------------------------------------------


def from_iter(events: Iterable[Event]) -> list[Event]:
    """Snapshot an iterable into a list — matches Flink's bounded source.

    A real job would call `env.add_source(MySource())`; we just collect.
    """
    return list(events)


# ---------------------------------------------------------------------------
# 3. Watermark assigner — periodic + per-event strategies
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class Watermarks:
    """Stateful periodic watermark generator.

    The classic Flink pattern: keep `max_timestamp` of every seen event,
    subtract `max_out_of_orderness`, and emit a watermark when it advances.
    """

    max_out_of_orderness: float = 2.0
    _max_seen: float = field(default=-1e18, init=False)

    def on_event(self, event_time: float) -> Watermark | None:
        if event_time < self._max_seen:
            # Late event — do NOT advance the watermark.
            return None
        prev = self._max_seen
        self._max_seen = event_time
        if self._max_seen - self.max_out_of_orderness <= prev:
            return None
        return Watermark(self._max_seen - self.max_out_of_orderness)

    @property
    def current(self) -> Watermark:
        return Watermark(self._max_seen - self.max_out_of_orderness)


# ---------------------------------------------------------------------------
# 4. KeyBy — partition a stream by key (greedy for our in-memory model)
# ---------------------------------------------------------------------------


def key_by(events: Sequence[Event]) -> dict[int, list[Event]]:
    """Group events by `key` — the `keyBy` operator in Flink.

    The real operator hashes keys across N parallel subtasks; here we
    just bucket them by key in a dict.
    """
    bucket: dict[int, list[Event]] = {}
    for ev in events:
        bucket.setdefault(ev.key, []).append(ev)
    # Sort every partition by event time — Flink guarantees nothing
    # about ordering across keys but per-key order is what matters for
    # window state.
    for k in bucket:
        bucket[k].sort(key=lambda e: e.event_time)
    return bucket


# ---------------------------------------------------------------------------
# 5. Window assigners
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Window:
    """An interval window with inclusive start / exclusive end."""
    start: float
    end: float

    def contains(self, t: float) -> bool:
        return self.start <= t < self.end

    def __repr__(self) -> str:
        return f"[{self.start:.1f}, {self.end:.1f})"


def assign_tumbling(events: Sequence[Event], size: float) -> dict[Window, list[Event]]:
    """Assign each event to a non-overlapping fixed-size window."""
    out: dict[Window, list[Event]] = {}
    for ev in events:
        start = (ev.event_time // size) * size
        w = Window(start, start + size)
        out.setdefault(w, []).append(ev)
    return out


def assign_sliding(
    events: Sequence[Event], size: float, slide: float
) -> dict[Window, list[Event]]:
    """Assign each event to every overlapping window of size `size`
    stepping by `slide`. Window starts are multiples of `slide`.
    """
    if slide <= 0 or size <= 0:
        raise ValueError("slide and size must be positive")
    out: dict[Window, list[Event]] = {}
    for ev in events:
        # Smallest window-start (multiple of slide) such that
        # start + size > ev.event_time AND start <= ev.event_time.
        # i.e. start in (event_time - size, event_time].
        start = ((ev.event_time - size) // slide + 1) * slide
        if start < 0.0:
            start = 0.0
        while start <= ev.event_time and start + size > ev.event_time:
            w = Window(start, start + size)
            out.setdefault(w, []).append(ev)
            start += slide
    return out


def assign_session(
    events: Sequence[Event], gap: float
) -> dict[Window, list[Event]]:
    """Group events into session windows separated by gaps >= `gap`.

    Per-key in real Flink; we accept a per-key (or merged) list of
    events already sorted by event_time. A new session starts when
    the gap between two consecutive events is >= `gap`.
    """
    out: dict[Window, list[Event]] = {}
    bucket: list[Event] = []
    cur_window: Window | None = None
    last_event_time: float | None = None
    for ev in events:
        new_session = (
            cur_window is None
            or last_event_time is None
            or ev.event_time - last_event_time >= gap
        )
        if new_session:
            if cur_window is not None and bucket:
                out[cur_window] = bucket
            # Session window spans from first event to last event + gap.
            cur_window = Window(ev.event_time, ev.event_time + gap)
            bucket = [ev]
        else:
            bucket.append(ev)
            # Extend in-progress window's end to ev.event_time + gap so
            # the window object covers the whole session.
            cur_window = Window(cur_window.start, ev.event_time + gap)
        last_event_time = ev.event_time
    if cur_window is not None and bucket:
        out[cur_window] = bucket
    return out


# ---------------------------------------------------------------------------
# 6. Aggregators
# ---------------------------------------------------------------------------


def aggregate(
    windows: dict[Window, list[Event]],
    reducer: Callable[[Sequence[float]], float] = sum,
) -> dict[Window, float]:
    """Reduce every window's payloads (not events!) into a scalar."""
    payloads = {w: [e.payload for e in es] for w, es in windows.items()}
    return {w: reducer(ps) for w, ps in payloads.items()}

# ---------------------------------------------------------------------------
# 7. Late events + side-output
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class LateStats:
    """Counters tracking how events were classified by the watermark."""
    on_time: int = 0
    late_dropped: int = 0
    late_updated: int = 0


def handle_late(
    windows: dict[Window, list[Event]],
    late_events: Iterable[Event],
    watermark_ts: float,
    *,
    strategy: str = "drop",
) -> tuple[dict[Window, list[Event]], LateStats]:
    """Apply a late-event strategy to a windowed state.

    - watermark_ts    : current watermark timestamp
    - strategy="drop" : drop events whose window has end <= watermark_ts
    - strategy="update": re-bucket the late event regardless (this is what
       the Flink `allowedLateness(...)` + side-output pattern does)
    """
    if strategy not in {"drop", "update"}:
        raise ValueError("strategy must be 'drop' or 'update'")
    stats = LateStats()
    for ev in late_events:
        placed = False
        for w in list(windows.keys()):
            if w.contains(ev.event_time):
                if strategy == "drop":
                    stats.late_dropped += 1
                else:
                    windows[w].append(ev)
                    stats.late_updated += 1
                placed = True
                break
        if not placed:
            stats.late_dropped += 1
        else:
            # Event fell inside at least one existing window.
            stats.on_time += 1 if w is not None else 0
    return windows, stats


# ---------------------------------------------------------------------------
# 8. End-to-end pipeline helper
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class WindowResult:
    """Outcome of one tumbling/sliding run."""
    window_type: str
    payload: dict[Window, float]


def run_pipeline(
    events: Sequence[Event],
    *,
    window_type: str = "tumbling",
    size: float = 5.0,
    slide: float = 1.0,
    session_gap: float = 3.0,
    key: bool = True,
) -> WindowResult:
    """One-shot run covering source -> assign -> aggregate.

    Supported window_type: tumbling, sliding, session.
    """
    if not key:
        # Without a key Flink treats the stream as one giant partition.
        bucket = sorted(events, key=lambda e: e.event_time)
    else:
        # We concatenate per-key partitions back into one sorted list
        # to give the global window assigner the same view it would
        # get across all parallel subtasks.
        bucket = sorted(events, key=lambda e: e.event_time)
    if window_type == "tumbling":
        wins = assign_tumbling(bucket, size=size)
    elif window_type == "sliding":
        wins = assign_sliding(bucket, size=size, slide=slide)
    elif window_type == "session":
        wins = assign_session(bucket, gap=session_gap)
    else:
        raise ValueError(f"unknown window_type: {window_type}")
    return WindowResult(window_type=window_type, payload=aggregate(wins, sum))


__all__ = [
    "Event",
    "Watermark",
    "Watermarks",
    "Window",
    "WindowResult",
    "LateStats",
    "from_iter",
    "key_by",
    "assign_tumbling",
    "assign_sliding",
    "assign_session",
    "aggregate",
    "handle_late",
    "run_pipeline",
]
