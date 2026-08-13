# System-design drills

Six graded drills for senior / staff interviews. Each drill has:

- A short scenario.
- Functional + non-functional requirements.
- A reference architecture that ties the chapters together.
- Acceptance criteria.
- A "stretch" goal that turns a passing answer into a great one.

Use the chapters in this repo as your reference. The chapter references
below point to the chapter that teaches the relevant primitive.

---

## 1. URL shortener

### Scenario

Build a URL shortener that takes a long URL and returns a short one
(e.g. `https://abc.example/xyz`). Reads dominate writes by ~100:1.

### Functional requirements

- `POST /shorten` with a long URL → returns a short URL.
- `GET /:id` returns a 302 redirect to the long URL.
- Optional: TTL, custom aliases, analytics.

### Non-functional requirements

- 1M reads/sec, 10K writes/sec.
- p99 read latency < 50 ms.
- Globally cacheable.

### Reference architecture

- **Storage**: a sharded key-value store. Key = `id`, value = long URL.
- **ID generation**: hash + base62 (chapter 02). Avoid collisions with
  a check-and-bump.
- **Cache**: an in-memory LRU at the edge (chapter 08 token bucket
  for write rate; chapter 12 observability).
- **Replication**: 3-way Raft per shard (chapter 10) for the source of
  truth; read replicas for the cache.
- **Wire**: length-prefixed TLV (chapter 01 + 02 + capstone).
- **Observability**: W3C trace context (chapter 12) end-to-end.

### Acceptance criteria

- Can explain the read/write ratio trade-off.
- Can describe the cache-invalidation strategy.
- Can discuss ID generation (collisions, predictability).
- Can describe the consistency model (eventual at the edge).

### Stretch

- Discuss geo-distribution. Multi-region replication with eventual
  consistency; CRDT opportunity (chapter 12).
- Discuss abuse: spam, phishing, rate limit per user (chapter 08).

---

## 2. Instant messenger

### Scenario

Build a 1:1 chat backend. Messages must arrive in order; offline users
receive messages on reconnect.

### Functional requirements

- `send(sender, recipient, body)` and `deliver(recipient)` APIs.
- Online presence: who is online now.
- Reconnect: deliver missed messages.

### Non-functional requirements

- 100M concurrent connections.
- p99 send → deliver < 200 ms in the same region.
- Persistent history.

### Reference architecture

- **Connection**: WebSocket per user (chapter 06). Maybe long-poll
  fallback.
- **Fan-out**: a partitioned log (chapter 12). Each recipient has a
  partition; send appends to it.
- **Ordering**: per-user sequence numbers; out-of-order detection
  on the client (chapter 09 HLC).
- **Presence**: gossip (chapter 11) with TTL.
- **Storage**: append-only log; replay on reconnect; compact
  periodically (chapter 11 LSM).
- **Reliability**: idempotency keys on send (chapter 08), client
  retries with backoff (chapter 08).
- **Observability**: structured logs with trace ids (chapter 12).

### Acceptance criteria

- Can explain the per-user ordering invariant.
- Can describe push vs pull for presence.
- Can describe offline replay.
- Can describe the difference between a chat log and a feed.

### Stretch

- Group chat (fan-out on N recipients). Cost model.
- Encryption (E2EE). Key rotation.
- Voice / video (WebRTC, chapter 05 SCTP).

---

## 3. Distributed key-value store

### Scenario

Build a strongly-consistent distributed key-value store for a
configuration system. 100K writes/sec, 1M reads/sec.

### Functional requirements

- `put(key, value)` and `get(key)`.
- Strong consistency: a read after a write returns the write.
- Configurable durability.

### Non-functional requirements

- p99 read < 10 ms.
- 99.99% availability.
- Survive 1 node failure without losing data.

### Reference architecture

- **Consensus**: Raft (chapter 10). 5 nodes per shard; quorum = 3.
- **Replication**: leader-forwarded writes; quorum reads.
- **Storage**: LSM tree on disk (chapter 11). Memtable + SSTables.
- **Sharding**: consistent hashing with virtual nodes (chapter 11).
- **Wire**: length-prefixed TLV (chapter 01 + 02 + capstone).
- **Failure detection**: gossip (chapter 11).
- **Clocks**: HLC for cross-node ordering (chapter 09).
- **Observability**: per-shard metrics + trace context (chapter 12).

### Acceptance criteria

- Can explain the `(R, W, N)` choice.
- Can describe snapshot transfer.
- Can describe the read-repair / anti-entropy trade-off.
- Can describe the cost of strong consistency (latency vs availability).

### Stretch

- Linearizable reads from a leader lease (chapter 09 TrueTime).
- Multi-region consensus with witnesses (chapter 10 + 11).
- Lock service with fencing tokens (chapter 09).

---

## 4. Real-time leaderboard

### Scenario

A game has 100M users. Each user has a score. The leaderboard shows
the top 1000 players, refreshed every second.

### Functional requirements

- `update(userId, score)` (idempotent).
- `top(n)` returns the top N users.
- Per-user rank query.

### Non-functional requirements

- 100K updates/sec.
- `top(1000)` < 50 ms.

### Reference architecture

- **Storage**: a sorted set per shard (chapter 11 MVCC). Each shard
  holds a contiguous range of users.
- **Index**: a per-shard sorted structure (skip list, LSM-as-sorted-
  run). Periodic merge.
- **Top-K**: cache the top 1000 per shard; merge across shards for
  global top.
- **Writes**: idempotency keys (chapter 08) — score updates can
  repeat.
- **Replication**: per-shard Raft (chapter 10) for durability.
- **Observability**: per-shard counters (chapter 12).

### Acceptance criteria

- Can explain the difference between sorted-set and aggregate.
- Can describe the merge strategy.
- Can describe the cost of "true" top-K vs cached top-K.

### Stretch

- Approximate top-K (Count-Min, HyperLogLog).
- Time-window leaderboards (sliding window).
- Per-region leaderboards with global aggregation.

---

## 5. Pub/Sub

### Scenario

A pub/sub platform with topic per channel. Producers publish; consumers
subscribe.

### Functional requirements

- `publish(topic, payload)` and `subscribe(topic, consumer)`.
- At-least-once delivery.
- Replay from offset.

### Non-functional requirements

- 1M publishes/sec.
- p99 end-to-end latency < 100 ms.
- Retention: 7 days.

### Reference architecture

- **Storage**: a partitioned log (chapter 12). One partition per
  topic hash; consumers track offset.
- **Replication**: per-partition Raft (chapter 10) for durability.
- **Consumer groups**: each group has its own offset; the partition
  hands a record to one member (chapter 07 ECMP-like hash).
- **Reliability**: idempotency keys on publish (chapter 08), retries
  on consume (chapter 08).
- **Hot partition mitigation**: virtual nodes (chapter 11),
  sub-partitioning, or consistent hash on key.
- **Observability**: per-topic lag, throughput, error rate
  (chapter 12).

### Acceptance criteria

- Can explain the difference between a queue and a log.
- Can describe consumer-group semantics.
- Can describe replay semantics.
- Can describe exactly-once via transactions.

### Stretch

- Schema registry (chapter 02 Protobuf).
- Tiered storage (chapter 11 LSM).
- Multi-region failover.

---

## 6. Geo-distributed log

### Scenario

A log service that spans 3 regions. Each region must keep accepting
writes even if the other regions are unreachable.

### Functional requirements

- `append(record)` returns a global offset.
- `read(offset)` returns the record.
- Conflicting writes resolve deterministically.

### Non-functional requirements

- Per-region latency < 50 ms.
- Survives region loss.
- Eventually consistent globally.

### Reference architecture

- **Per-region Raft** with a witness in a third region (chapter 10).
- **Anti-entropy** between regions (chapter 11 Merkle tree).
- **Conflict resolution**: LWW-Register semantics (chapter 12) per
  record, or a CRDT for ordered sets.
- **Cross-region reads**: HLC (chapter 09) to order.
- **Wire**: TLV (chapter 01 + 02 + capstone).
- **Observability**: cross-region trace (chapter 12).

### Acceptance criteria

- Can explain the difference between Raft and Paxos for this case.
- Can describe the witness model.
- Can describe the conflict-resolution strategy.
- Can describe the cost of strong consistency across regions.

### Stretch

- Byzantine fault tolerance (BFT) consensus.
- Tail-latency bounding with hedged reads (chapter 08).
- Compliance/legal: data residency.

---

## How to run a drill

1. **Read the requirements.** Resist the urge to start drawing boxes.
2. **Ask questions.** Backlog, traffic mix, data volume, consistency
   needs, durability, compliance.
3. **Sketch the data flow.** Producer → storage → consumer.
4. **Identify the chapters.** Pick a chapter for each primitive; point
   at the file.
5. **Address non-functionals.** Latency, throughput, availability.
6. **Trade-offs.** What are you giving up? Why is this the right
   trade-off?
7. **Stretch.** What would you do with another month?

The chapters give you the vocabulary. The system-design drills give
you the structure.
