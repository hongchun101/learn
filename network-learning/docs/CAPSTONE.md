# Capstone — a tiny distributed key-value store

The capstone is a small, runnable "netstack" that exercises every chapter
in one artifact. It is intentionally minimal: enough code to be real,
not so much that it becomes a project.

## What it is

A 3-node in-memory distributed key-value store. The cluster has a leader
(designated, not elected) and N followers. Each put is appended to a Raft
log, replicated to a majority, and then applied to every node's store.
The client uses idempotency keys to dedupe retries, jittered backoff to
avoid thundering, and an HLC to timestamp every operation. Every operation
emits a structured log line carrying a W3C trace context.

## Where it lives

```
src/capstone/
├── wire.ts        TLV / varint / u16-BE length-prefixed framing  (ch 01, 02)
├── store.ts       in-memory KV with MVCC tie-breaking           (ch 11)
├── raft.ts        Raft log + majority commit                    (ch 10)
├── cluster.ts     cluster + client (backoff, idempotency, HLC)  (ch 08, 09)
├── demo.ts        end-to-end smoke test
└── index.ts       public surface
tests/capstone.test.ts    10 tests covering wire, store, raft, e2e
```

## How it works

### 1. Wire format (`wire.ts`)

Each `Op` is a u16-BE length-prefixed frame containing TLV entries:

| Type | Field                  | Encoding                          |
| ---- | ---------------------- | --------------------------------- |
| 0x01 | key                    | varint length + UTF-8 bytes       |
| 0x02 | value (optional)       | varint length + bytes             |
| 0x03 | idempotency key        | 16 bytes                          |
| 0x04 | trace id               | 16 bytes                          |
| 0x05 | client ts (HLC phys)   | u32 BE                            |
| 0x06 | flags                  | u8 (bit 0 = put, bit 1 = get)     |

The TLV format means we can add new fields without breaking old clients.

### 2. Store (`store.ts`)

A `Map<key, {value, ts, idempotencyKey}>`. Writes are MVCC:

- If the new `ts` is higher, accept.
- If equal, the entry with the higher idempotency key wins.
- Otherwise reject.

This is the same trade-off as Spanner's TrueTime + tie-breaking.

### 3. Raft log (`raft.ts`)

A `RaftLog` holds an array of `LogEntry` and a per-follower
`matchedIndex`. `tryCommit()` computes the majority index as the median
of `[leader_index, ...follower_indices]` (sorted desc). A leader commits
only entries from the current term.

The Campus leader is *designated* (the first node of the cluster). Real
Raft needs randomised timeouts; we omit them so the tests stay
deterministic.

### 4. Cluster + client (`cluster.ts`)

- `Cluster` builds N nodes (each with its own `KvStore` and `RaftLog`).
- `Cluster.put(op)` appends to the leader's log, replicates to every
  follower, then commits if a majority has the entry.
- `Client.put(key, value, idempotencyKey, traceId)`:
  1. Builds an `Op` with the HLC's current physical ms.
  2. Encodes it as a wire frame and decodes it (exercising the codec).
  3. Looks up the idempotency key; if cached, returns the cached result.
  4. Calls `cluster.put`; on failure retries with full-jitter backoff up
     to `maxAttempts`.
  5. Caches the result in the idempotency store.

## How to run it

```bash
npm test -- tests/capstone.test.ts   # 10 tests
npx tsx src/capstone/demo.ts          # end-to-end demo
```

## What it teaches

Reading the capstone source in this order exercises every chapter:

1. `wire.ts` — chapters 01 (BitCursor / u16 framing) and 02 (varint, TLV).
2. `store.ts` — chapter 11 (MVCC, anti-entropy).
3. `raft.ts` — chapter 10 (Raft log + commit).
4. `cluster.ts` — chapters 08 (jittered backoff, idempotency),
   09 (HLC), 11 (replication), 12 (structured logs).
5. `demo.ts` — glue.

## How to extend it

A few ideas for a learner, in increasing difficulty:

- **Snapshot transfer.** Add a `snapshot` to each node and a transfer
  protocol. Add a `KvStore.compact()` that flushes old entries.
- **Leader election.** Replace the designated leader with a term-based
  election. Add a randomised timeout and vote requests.
- **Network simulation.** Replace the in-process transport with a
  lossy, ordered channel. Add a `Partition` class that drops messages.
- **Client-side load balancing.** Add a `ConsistentHash` from chapter 11
  to pick the cluster node per-key.
- **Observability.** Wire the W3C `traceparent` header through the
  cluster. Add a `Tracer` from chapter 12 and emit spans per call.
- **Saga.** Make a `put` a Saga step: write to a write-ahead log, then
  to the store, with a compensation on failure.

Each of these is a real chapter. None of them is toy.
