"""In-memory Kafka simulation for the curriculum.

This module mimics the core mechanics of Apache Kafka well enough to write
unit tests against the real semantics:

- Topics are split into partitions, each partition is an append-only list
  of records addressed by a monotonically increasing offset.
- Producers append records; consumers read by polling partitions.
- A ConsumerGroup tracks committed offsets per partition, supports manual
  commits, and rebalances partition assignments when members join/leave.
- Rebalance is range-style: partitions are distributed round-robin to
  current group members.

It is intentionally simple -- no persistence, no replication, no leader
election. The goal is to make offset / partition / rebalance semantics
executable without standing up a real Kafka cluster.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


# --------------------------------------------------------------------------- #
# Records & log                                                              #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Record:
    """A single message in the log."""

    topic: str
    partition: int
    offset: int
    key: str | None
    value: str

    def __repr__(self) -> str:
        return (
            f"Record(topic={self.topic!r}, partition={self.partition}, "
            f"offset={self.offset}, key={self.key!r}, value={self.value!r})"
        )


class Partition:
    """An append-only log for a single partition."""

    def __init__(self, topic: str, partition: int) -> None:
        self.topic = topic
        self.partition = partition
        self.records: list[Record] = []

    def append(self, key: str | None, value: str) -> Record:
        offset = len(self.records)
        rec = Record(self.topic, self.partition, offset, key, value)
        self.records.append(rec)
        return rec

    def read_from(self, offset: int) -> list[Record]:
        if offset < 0:
            offset = 0
        return self.records[offset:]


# --------------------------------------------------------------------------- #
# Topic                                                                      #
# --------------------------------------------------------------------------- #


class Topic:
    """A topic with a fixed number of partitions."""

    def __init__(self, name: str, num_partitions: int = 1) -> None:
        if num_partitions < 1:
            raise ValueError("num_partitions must be >= 1")
        self.name = name
        self.partitions: list[Partition] = [
            Partition(name, i) for i in range(num_partitions)
        ]

    def partition_for(self, key: str | None) -> Partition:
        """Hash-partition when key is set, else pick the least-loaded partition."""
        if key is None:
            return min(self.partitions, key=lambda p: len(p.records))
        idx = hash(key) % len(self.partitions)
        return self.partitions[idx]


# --------------------------------------------------------------------------- #
# Broker                                                                     #
# --------------------------------------------------------------------------- #


class Broker:
    """An in-memory broker holding multiple topics."""

    def __init__(self) -> None:
        self.topics: dict[str, Topic] = {}

    def create_topic(self, name: str, num_partitions: int = 1) -> Topic:
        if name in self.topics:
            raise ValueError(f"topic already exists: {name}")
        t = Topic(name, num_partitions)
        self.topics[name] = t
        return t

    def get_topic(self, name: str) -> Topic:
        if name not in self.topics:
            raise KeyError(f"unknown topic: {name}")
        return self.topics[name]


# --------------------------------------------------------------------------- #
# Producer                                                                   #
# --------------------------------------------------------------------------- #


class Producer:
    """Synchronous producer with optional acks='all' semantics."""

    def __init__(self, broker: Broker, acks: str = "1") -> None:
        if acks not in ("0", "1", "all"):
            raise ValueError("acks must be one of '0', '1', 'all'")
        self.broker = broker
        self.acks = acks

    def send(self, topic: str, value: str, key: str | None = None) -> Record:
        t = self.broker.get_topic(topic)
        partition = t.partition_for(key)
        rec = partition.append(key, value)
        # acks=all -> notional barrier; in-memory we always satisfy it.
        return rec


# --------------------------------------------------------------------------- #
# Consumer                                                                   #
# --------------------------------------------------------------------------- #


@dataclass
class _Assignment:
    topic: str
    partitions: list[int] = field(default_factory=list)


class Consumer:
    """Poll-based consumer; commits offsets to a shared ConsumerGroup."""

    def __init__(
        self,
        broker: Broker,
        group: "ConsumerGroup",
        consumer_id: str,
        auto_offset_reset: str = "earliest",
    ) -> None:
        if auto_offset_reset not in ("earliest", "latest"):
            raise ValueError("auto_offset_reset must be 'earliest' or 'latest'")
        self.broker = broker
        self.group = group
        self.consumer_id = consumer_id
        self.auto_offset_reset = auto_offset_reset
        self.assignments: dict[str, _Assignment] = {}
        # Local read pointers; updated on poll and commit.
        self._positions: dict[tuple[str, int], int] = {}
        group._register(self)

    # -- subscription ---------------------------------------------------- #

    def subscribe(self, topic: str) -> None:
        if topic not in self.assignments:
            self.assignments[topic] = _Assignment(topic=topic)
        self.group._request_rebalance()

    # -- poll ------------------------------------------------------------ #

    def poll(self, topic: str, timeout: int = 100) -> list[Record]:
        """Return every record readable from the assigned partitions."""
        if topic not in self.assignments:
            raise RuntimeError(
                f"consumer {self.consumer_id} not subscribed to {topic}"
            )
        assignment = self.assignments[topic]
        if not assignment.partitions:
            return []
        out: list[Record] = []
        for part_id in assignment.partitions:
            partition = self.broker.get_topic(topic).partitions[part_id]
            pos = self._resolve_position(topic, part_id)
            records = partition.read_from(pos)
            out.extend(records)
            self._positions[(topic, part_id)] = pos + len(records)
        out.sort(key=lambda r: (r.partition, r.offset))
        return out

    def _resolve_position(self, topic: str, partition: int) -> int:
        if (topic, partition) in self._positions:
            return self._positions[(topic, partition)]
        committed = self.group.committed_offset(topic, partition)
        if committed is not None:
            self._positions[(topic, partition)] = committed
            return committed
        if self.auto_offset_reset == "earliest":
            return 0
        # 'latest' -> start at end-of-log
        return len(self.broker.get_topic(topic).partitions[partition].records)

    # -- commit / replay -------------------------------------------------- #

    def commit(self) -> None:
        """Commit current local positions for all assigned partitions."""
        for (topic, partition), pos in self._positions.items():
            self.group._commit(self.consumer_id, topic, partition, pos)

    def seek_to_beginning(self, topic: str) -> None:
        for part_id in self.assignments[topic].partitions:
            self._positions[(topic, part_id)] = 0
            self.group._commit(self.consumer_id, topic, part_id, 0)

    def committed(self, topic: str, partition: int) -> int | None:
        return self.group.committed_offset(topic, partition)


# --------------------------------------------------------------------------- #
# Consumer group & rebalance                                                 #
# --------------------------------------------------------------------------- #


class ConsumerGroup:
    """Group coordinator: tracks members, owns offsets, drives rebalances."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.broker: Broker | None = None
        self._members: dict[str, Consumer] = {}
        # (topic, partition) -> committed offset
        self._offsets: dict[tuple[str, int], int] = {}
        self._rebalance_log: list[dict] = []

    def attach_broker(self, broker: Broker) -> None:
        """Bind the group to a broker so rebalance can enumerate partitions."""
        self.broker = broker

    # -- membership ------------------------------------------------------ #

    def _register(self, consumer: Consumer) -> None:
        self._members[consumer.consumer_id] = consumer

    def members(self) -> list[str]:
        return sorted(self._members)

    def join(self, consumer: Consumer, topic: str) -> None:
        consumer.subscribe(topic)

    def leave(self, consumer_id: str) -> None:
        self._members.pop(consumer_id, None)
        self._rebalance()

    # -- rebalance ------------------------------------------------------- #

    def _request_rebalance(self) -> None:
        self._rebalance()

    def _rebalance(self) -> None:
        """Assign every partition of every subscribed topic to exactly one
        active member. Membership is sorted for determinism; partitions
        are distributed round-robin via a stable hash so the same setup
        always yields the same assignment (helpful for tests)."""
        subscribed_topics: set[str] = set()
        for c in self._members.values():
            subscribed_topics.update(c.assignments.keys())
        topics: dict[str, list[int]] = {}
        for topic in subscribed_topics:
            if self.broker is not None and topic in self.broker.topics:
                topics[topic] = list(
                    range(len(self.broker.topics[topic].partitions))
                )
            else:
                topics[topic] = []
        member_ids = sorted(self._members)
        assignments_by_member: dict[str, dict[str, list[int]]] = {
            mid: {t: [] for t in topics} for mid in member_ids
        }
        if member_ids:
            for topic in sorted(topics):
                for part_id in sorted(topics[topic]):
                    idx = (
                        hash((topic, part_id, "|".join(member_ids)))
                        % len(member_ids)
                    )
                    chosen = member_ids[idx]
                    assignments_by_member[chosen][topic].append(part_id)
        for mid, topic_map in assignments_by_member.items():
            consumer = self._members[mid]
            for topic, parts in topic_map.items():
                if topic in consumer.assignments:
                    consumer.assignments[topic].partitions = sorted(parts)
                else:
                    consumer.assignments[topic] = _Assignment(
                        topic=topic, partitions=sorted(parts)
                    )
        self._rebalance_log.append(
            {
                "members": list(member_ids),
                "assignments": {
                    mid: {t: list(p) for t, p in tm.items()}
                    for mid, tm in assignments_by_member.items()
                },
            }
        )

    # -- offset storage -------------------------------------------------- #

    def _commit(
        self, consumer_id: str, topic: str, partition: int, offset: int
    ) -> None:
        self._offsets[(topic, partition)] = offset

    def committed_offset(self, topic: str, partition: int) -> int | None:
        return self._offsets.get((topic, partition))

    def rebalance_log(self) -> list[dict]:
        return list(self._rebalance_log)


# --------------------------------------------------------------------------- #
# High-level helpers used by tests                                           #
# --------------------------------------------------------------------------- #


def build_demo(num_partitions: int = 3) -> tuple[Broker, Producer, ConsumerGroup]:
    """Spin up a 3-partition topic called ``orders`` and return the handles."""
    broker = Broker()
    broker.create_topic("orders", num_partitions=num_partitions)
    producer = Producer(broker, acks="all")
    group = ConsumerGroup("orders-consumer")
    group.attach_broker(broker)
    return broker, producer, group


def produce_batch(
    producer: Producer, items: Iterable[tuple[str | None, str]]
) -> list[Record]:
    out: list[Record] = []
    for key, value in items:
        out.append(producer.send("orders", value, key=key))
    return out


def drain_consumer(consumer: Consumer, topic: str) -> list[Record]:
    """Poll until empty -- convenient for tests and demos."""
    out: list[Record] = []
    while True:
        batch = consumer.poll(topic)
        if not batch:
            break
        out.extend(batch)
    return out
