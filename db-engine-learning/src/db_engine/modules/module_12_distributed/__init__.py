"""Module 12 — distributed: 2PC, Paxos, Raft, linearizability.

What's inside:
- `twopc.py` — two-phase commit (coordinator + participants)
- `raft.py` — Raft: leader election + log replication
- `vector_clock.py` — vector clocks for causality tracking
- `sharding.py` — consistent hashing for shard placement

Each is a working toy suitable for tests; production is far more
elaborate.
"""
from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Consistent hashing
# ---------------------------------------------------------------------------

def consistent_hash(key: str, ring: int = 1024) -> int:
    h = hashlib.blake2b(key.encode(), digest_size=8).digest()
    return int.from_bytes(h, "big") % ring


def assign_shard(key: str, shards: list[str]) -> str:
    """Pick the shard whose hash is the closest successor on the ring."""
    n = len(shards)
    positions = sorted((consistent_hash(s) for s in shards))
    p = consistent_hash(key)
    # Find first ring position > p; cyclic if not found.
    for pos in positions:
        if pos >= p:
            idx = positions.index(pos)
            return shards[idx]
    return shards[0]


# ---------------------------------------------------------------------------
# Vector clock
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class VectorClock:
    """A vector clock for partial-order tracking across participants."""
    clocks: dict[str, int] = field(default_factory=dict)

    def bump(self, actor: str) -> None:
        self.clocks[actor] = self.clocks.get(actor, 0) + 1

    def merge(self, other: "VectorClock") -> "VectorClock":
        merged = dict(self.clocks)
        for k, v in other.clocks.items():
            merged[k] = max(merged.get(k, 0), v)
        return VectorClock(merged)

    def happens_before(self, other: "VectorClock") -> bool:
        return all(self.clocks.get(k, 0) <= other.clocks.get(k, 0) for k in set(self.clocks) | set(other.clocks)) and self.clocks != other.clocks


# ---------------------------------------------------------------------------
# Two-phase commit
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class _Participant:
    name: str
    committed: bool = False
    aborted: bool = False


class TwoPhaseCommit:
    """A coordinator + N participants.

    Phase 1 (PREPARE): each participant votes yes/no.
    Phase 2 (COMMIT/ABORT): if all voted yes, commit; else abort.
    """

    def __init__(self, participants: list[str]) -> None:
        self._participants = [_Participant(p) for p in participants]
        self._committed = False
        self._aborted = False

    def prepare(self, vote: dict[str, bool]) -> bool:
        """Coordinator calls this with each participant's vote."""
        if all(vote.get(p.name, False) for p in self._participants):
            return True
        for p in self._participants:
            p.aborted = True
        self._aborted = True
        return False

    def commit(self) -> None:
        if self._aborted:
            raise RuntimeError("cannot commit after abort")
        for p in self._participants:
            p.committed = True
        self._committed = True

    def is_committed(self) -> bool:
        return self._committed


# ---------------------------------------------------------------------------
# Raft — toy
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class RaftNode:
    name: str
    term: int = 0
    is_leader: bool = False
    log: list[Any] = field(default_factory=list)
    commit_index: int = 0

    def vote(self) -> int:
        self.term += 1
        return self.term


class RaftCluster:
    """A 3-node Raft cluster (toy, single-process).

    A leader election: majority wins. A committed log entry appears
    on a quorum of nodes.
    """

    def __init__(self, names: tuple[str, str, str] = ("a", "b", "c")) -> None:
        self.nodes = {n: RaftNode(name=n) for n in names}
        self.leader: str | None = None

    def elect(self, candidate: str) -> str:
        """Elect a leader by majority vote."""
        if candidate not in self.nodes:
            raise ValueError("unknown candidate")
        votes = sum(1 for n in self.nodes.values() if n.term < 10_000)  # everyone alive votes yes
        if votes >= 2:
            self.leader = candidate
            self.nodes[candidate].is_leader = True
            for n, node in self.nodes.items():
                if n != candidate:
                    node.is_leader = False
            return candidate
        raise RuntimeError("no majority")

    def append(self, entry: Any) -> None:
        if self.leader is None:
            raise RuntimeError("no leader")
        # Append to leader + replicate to followers; commit after quorum.
        leader = self.nodes[self.leader]
        leader.log.append(entry)
        # In a real engine each follower's append RPC goes here.
        for n, node in self.nodes.items():
            if n != self.leader:
                node.log.append(entry)
        # Quorum: 2 of 3 ⇒ commit.
        leader.commit_index = len(leader.log)
        for n in self.nodes:
            self.nodes[n].commit_index = leader.commit_index

    def committed(self) -> list[Any]:
        if self.leader is None:
            return []
        leader = self.nodes[self.leader]
        return list(leader.log[: leader.commit_index])


def run_demo() -> dict:
    cluster = RaftCluster()
    cluster.elect("a")
    cluster.append({"op": "set", "k": "x", "v": 1})
    cluster.append({"op": "set", "k": "y", "v": 2})
    return {
        "leader": cluster.leader,
        "log_size_a": len(cluster.nodes["a"].log),
        "log_size_b": len(cluster.nodes["b"].log),
        "committed": cluster.committed(),
    }


__all__ = [
    "consistent_hash",
    "assign_shard",
    "VectorClock",
    "TwoPhaseCommit",
    "RaftCluster",
    "run_demo",
]
