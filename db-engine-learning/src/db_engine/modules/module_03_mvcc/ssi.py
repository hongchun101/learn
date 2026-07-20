"""SSI — Serializable Snapshot Isolation.

Snapshot isolation (default mode of `MultiVersionStore`) is *not*
serializable: two transactions can both read a row and write new
copies without conflicting (write skew). SSI catches this by
checking for a "dangerous structure" — a pair of concurrent txns
where each reads what the other writes, forming a cycle of rw
dependencies.

For the curriculum we implement a simpler check: at commit time,
scan the read set; if any read was overwritten by another txn since
we started and that txn's write set overlaps our write set, abort.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


@dataclass(slots=True)
class _Edge:
    """A read-write dependency edge."""

    reader_txn: int
    writer_txn: int
    key: bytes


@dataclass(slots=True)
class SerializabilityTracker:
    """One per transaction; tracks incoming rw edges."""

    txn_id: int
    read_set: set[bytes] = field(default_factory=set)
    write_set: set[bytes] = field(default_factory=set)
    incoming_rw: list[_Edge] = field(default_factory=list)

    def add_read(self, key: bytes) -> None:
        self.read_set.add(key)

    def add_write(self, key: bytes) -> None:
        self.write_set.add(key)

    def record_incoming(self, other_txn: int, key: bytes) -> None:
        self.incoming_rw.append(_Edge(other_txn, self.txn_id, key))

    def is_serializability_violation(self) -> bool:
        """Detect the textbook write-skew pattern:

            - We read keys in R.
            - Another txn (the "winner") wrote keys in W ∪ R_post.
            - That winner's commit_ts falls in our snapshot interval.
            - If win reads from us OR vice-versa, abort.
        """
        # Check for the cycle: a peer wrote something we read, *and*
        # we wrote something the peer read. A real SSI engine would
        # encode a graph; we approximate by counting overlapping edges.
        keys_with_edges = {e.key for e in self.incoming_rw}
        if not (self.write_set & keys_with_edges):
            return False
        # Otherwise, peer wrote what we read AND we wrote what peer
        # read ⇒ cycle ⇒ not serializable ⇒ abort.
        return any(self.write_set & set([e.reader_txn]) for e in self.incoming_rw)


__all__ = ["SerializabilityTracker"]
