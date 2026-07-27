# L2 — Internals

> Goal:  understand the pieces inside a broker — partitions, replicas,
> ISR, leader election, log segments, low/high watermarks, group
> rebalances.

## 1. Why it matters

Production incidents are *always* an internals problem:

* “Why is one partition lagging?” → log segment / ISR.
* “Why is the consumer stuck on a rebalance?” → group coordinator.
* “Why did the leader change twice in a minute?” → unclean leader
  election / broker bounce.

If you don’t know the model you can’t read the symptoms.

## 2. Mental model

```
                +--------+       +--------+       +--------+
   producer ──► |  p0 L  | <───  |  p0 F  | <───  |  p0 F  |
                | broker1|       | broker2|       | broker3|
                +--------+       +--------+       +--------+
                |  p1 F  | ───►  |  p1 L  | <───  |  p1 F  |
                +--------+       +--------+       +--------+
                |  p2 F  | <───  |  p2 F  | ───►  |  p2 L  |
                +--------+       +--------+       +--------+
```

* **Replication factor (RF)** = number of replicas per partition.
* **In-Sync Replicas (ISR)** = replicas that have caught up to the
  leader’s high-watermark within `replica.lag.time.max.ms`.
* **Leader** = the only broker that accepts writes for the partition.
* **High watermark (HW)** = the offset the slowest ISR has replicated
  — consumers can only read up to HW-1.
* **Low watermark** = the offset of the oldest *retained* record
  (= first segment still on disk).

## 3. Code walkthrough

### `LeaderWatcher`

Polls `describeTopics` every 2 s, prints the leader broker of every
partition of `l1.greetings`.  An asterisk marks a partition whose
leader changed since the previous poll.

### `ReplicaLagDemo`

Implements the same logic as `kafka-consumer-groups --describe`:

```
end_offset - committed_offset = lag
```

### `SegmentInspector`

Shows the low- and high-watermark for every partition — the visible
window the broker is willing to serve.

### `GroupRebalanceDemo`

Subscribes with the `CooperativeStickyAssignor` and prints the
`onPartitionsRevoked/Assigned/Lost` callbacks.  Cooperative rebalancing
is the modern path:  only the *moved* partitions are revoked, not the
whole assignment.

## 4. Lab

```bash
mvn -B -ntp -DskipTests -pl modules/l2-internals -am package
bash scripts/labs/l2.sh
```

Then open two terminals and run:

```bash
java -DdurationMs=60000 -cp <cp> com.kafkalearn.l2.GroupRebalanceDemo
```

You will see one terminal log `ASSIGNED` and the other log
`REVOKED → ASSIGNED` when the second one starts.

## 5. Production traps

* **Unclean leader election** (`unclean.leader.election.enable=true`)
  trades availability for consistency:  you may lose every record
  between the old leader’s death and the new leader’s election.
* **`replica.lag.time.max.ms`** is the only knob that decides ISR
  membership.  Set it too tight and a slow replica gets kicked out
  on every GC pause.
* **`min.insync.replicas`** must be ≥ 2 for any guarantee.  The
  default is 1, which is meaningless.
* The **log segment** is the unit of compaction and retention.  A
  badly sized `log.segment.bytes` hurts both throughput and
  compaction speed.

## 6. Check yourself

1. What is the difference between `unclean.leader.election.enable=true`
   and `=false`?
2. Why is HW = min(LEO) over the ISR?
3. Why does `CooperativeStickyAssignor` reduce stop-the-world pauses
   in long-running consumers?

## 7. Further reading

* KIP-279 / KIP-429 — cooperative rebalancing.
* KIP-500 — KRaft (covered in L7).
