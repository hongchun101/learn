"""Tests for the in-memory Kafka simulation.

The tests focus on observable contracts that real Kafka exposes:

- producer appends to the correct partition based on key hash;
- consumer commits offsets that survive a restart;
- consumer group assigns every partition to exactly one member;
- leaving a consumer triggers a rebalance and partition takeover;
- seek_to_beginning replays the log from offset 0.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

# Make the src/ directory importable without an __init__.py file.
SRC = ROOT / "modules" / "09-kafka" / "src"
sys.path.insert(0, str(SRC))

from kafka_demo import (  # noqa: E402  (sys.path mutation above)
    Broker,
    Consumer,
    ConsumerGroup,
    Producer,
    build_demo,
    produce_batch,
)


@pytest.fixture()
def stack():
    """Fresh broker + producer + group for every test."""
    broker, producer, group = build_demo(num_partitions=3)
    return broker, producer, group


# ----------------------------------------------------------------------- #
# 1. Offset commit / resume                                                #
# ----------------------------------------------------------------------- #


def test_offset_commit_and_resume(stack):
    """A consumer commits its position; a new consumer with the same group
    resumes from the committed offset rather than the auto-reset default."""
    broker, producer, group = stack

    produce_batch(
        producer,
        [
            ("u1", "order-1"),
            ("u2", "order-2"),
            ("u1", "order-3"),
            ("u3", "order-4"),
        ],
    )

    c1 = Consumer(broker, group, "c1")
    c1.subscribe("orders")
    first = c1.poll("orders")
    assert first, "first poll should yield records"
    c1.commit()

    # A new consumer joining the same group must NOT replay the log.
    c2 = Consumer(broker, group, "c2")
    c2.subscribe("orders")
    second = c2.poll("orders")
    assert second == [], (
        "new consumer in same group should resume from committed offset, "
        f"got {second}"
    )


# ----------------------------------------------------------------------- #
# 2. Partition assignment                                                  #
# ----------------------------------------------------------------------- #


def test_partition_assignment_covers_all_partitions(stack):
    """After subscribe, every partition must be assigned to exactly one consumer."""
    broker, producer, group = stack

    produce_batch(producer, [("k", f"v{i}") for i in range(6)])

    c1 = Consumer(broker, group, "c1")
    c2 = Consumer(broker, group, "c2")
    c1.subscribe("orders")
    c2.subscribe("orders")
    # subscribe() already triggered a rebalance with empty partitions, so
    # run it again now that both consumers are subscribed.
    group._rebalance()

    # Each partition must appear in exactly one consumer's assignment.
    ownership: list[tuple[int, str]] = []
    for member_id in group.members():
        consumer = {"c1": c1, "c2": c2}[member_id]
        for part_id in consumer.assignments["orders"].partitions:
            ownership.append((part_id, member_id))
    partitions_seen = [p for p, _ in ownership]
    assert sorted(partitions_seen) == [0, 1, 2], (
        f"missing partitions: {partitions_seen}"
    )
    assert len(partitions_seen) == len(set(partitions_seen)), (
        f"a partition was assigned to multiple consumers: {ownership}"
    )


# ----------------------------------------------------------------------- #
# 3. Rebalance on consumer leave                                           #
# ----------------------------------------------------------------------- #

def test_rebalance_when_consumer_leaves(stack):
    """Leaving a consumer triggers rebalance; surviving consumer takes over."""
    broker, producer, group = stack

    produce_batch(producer, [("k", f"v{i}") for i in range(9)])

    c1 = Consumer(broker, group, "c1")
    c2 = Consumer(broker, group, "c2")
    c1.subscribe("orders")
    c2.subscribe("orders")
    # subscribe() already triggered a rebalance with empty partitions, so
    # run it again now that both consumers are subscribed.
    group._rebalance()

    # Sanity: every partition appears exactly once across both consumers.
    ownership: list[tuple[int, str]] = []
    for member_id in group.members():
        consumer = {"c1": c1, "c2": c2}[member_id]
        for part_id in consumer.assignments["orders"].partitions:
            ownership.append((part_id, member_id))
    partitions_seen = [p for p, _ in ownership]
    assert sorted(partitions_seen) == [0, 1, 2], (
        f"missing partitions: {partitions_seen}"
    )
    assert len(partitions_seen) == len(set(partitions_seen)), (
        f"a partition was assigned to multiple consumers: {ownership}"
    )

    # Both consumers process everything currently in the log and commit.
    first_c1 = c1.poll("orders")
    first_c2 = c2.poll("orders")
    c1.commit()
    c2.commit()
    total_first = len(first_c1) + len(first_c2)
    assert total_first > 0, "initial poll should yield records"

    # c1 leaves -> rebalance -> c2 picks up c1's partitions.
    group.leave("c1")
    c2_parts = c2.assignments["orders"].partitions
    assert sorted(c2_parts) == [0, 1, 2], (
        f"after rebalance c2 should own all partitions, got {c2_parts}"
    )

    # Produce more messages and confirm c2 sees them; nothing from the
    # previous batch should leak back in (offsets were committed).
    produce_batch(producer, [("k", "v-new-1"), ("k", "v-new-2")])
    second_c2 = c2.poll("orders")
    assert len(second_c2) >= 1, "c2 must read the newly produced messages"
    new_values = {r.value for r in second_c2}
    assert new_values <= {"v-new-1", "v-new-2"}, (
        f"unexpected records in replay: {new_values}"
    )


# ----------------------------------------------------------------------- #
# 4. Replay from beginning via seek                                        #
# ----------------------------------------------------------------------- #


def test_seek_to_beginning_replays_log(stack):
    """seek_to_beginning resets local position AND commits offset 0,
    so a consumer that owns every partition can replay the whole log."""
    _broker, _producer, _group = stack  # original 3-partition stack unused
    # Build a dedicated 1-partition topic so ownership is unambiguous.
    broker = Broker()
    broker.create_topic("orders", num_partitions=1)
    producer = Producer(broker, acks="all")
    group = ConsumerGroup("g")
    group.attach_broker(broker)

    producer.send("orders", "alpha", key="k1")
    producer.send("orders", "beta", key="k2")
    producer.send("orders", "gamma", key="k3")

    c1 = Consumer(broker, group, "c1")
    c1.subscribe("orders")
    drained = c1.poll("orders")
    assert len(drained) == 3
    c1.commit()

    # c1 leaves -> c2 owns everything when it joins.
    group.leave("c1")
    c2 = Consumer(broker, group, "c2")
    c2.subscribe("orders")
    # Committed offset already advanced; without seek, c2 sees nothing.
    assert c2.poll("orders") == []

    # Explicit seek to beginning replays every record.
    c2.seek_to_beginning("orders")
    replayed = c2.poll("orders")
    values = [r.value for r in replayed]
    assert sorted(values) == ["alpha", "beta", "gamma"], values
    for r in replayed:
        assert r.offset >= 0
