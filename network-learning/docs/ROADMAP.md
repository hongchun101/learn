# Curriculum roadmap — zero to expert

This roadmap turns the twelve chapters into a 12-week study plan aimed at a
senior / staff distributed-systems engineer track. Each week is **roughly
8–12 hours** of focused work: read the chapter header, study the source,
run the demo, read the chapter STUDY guide, attempt the exercises, then
attempt the matching interview questions.

If you finish all 12 weeks plus the capstone, you should be able to:

- Read an RFC and map it to an implementation in this repo.
- Implement framing, encoding, and error correction for a custom wire
  protocol that interoperates with industry tools.
- Reason about TCP, QUIC, congestion control, and tune real systems with
  jittered backoff, circuit breakers, and idempotency keys.
- Apply 2PC, Saga, Outbox, and TCC to multi-service workflows.
- Read a Paxos or Raft paper and map it to the chapter 10 implementation.
- Design a sharded, replicated, geo-distributed storage layer with CRDTs,
  MVCC, and LSM compaction.
- Diagnose distributed-systems failures (clock skew, split brain, dirty
  reads, lost updates) and pick the right tool from the curriculum.

---

## Prerequisites

- Comfortable reading TypeScript. You do not need to be an expert — the
  code is strict, well-typed, and tested.
- A working `node` (≥ 18) and `npm` (any recent version).
- Curiosity. The chapters assume you will read the comments and follow
  the citations.

---

## Week-by-week plan

| Week | Chapter(s)                 | Focus                                                                                      | Milestone                                                  |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 1    | 01 — Bits, Framing, Errors | The bit/byte substrate. COBS, CRC, Internet checksum, Hamming, RS.                         | Hand-decode a hex dump of a TCP segment.                  |
| 2    | 02 — Encoding & Wire       | Endianness, signed, varint, TLV, KLV, Protobuf-wire.                                       | Implement a tiny custom wire protocol with a Wire-Type     |
| 3    | 03 — Link & Physical       | dB, link budget, Shannon, modulation, line coding, 8b/10b.                                 | Compute a real link budget by hand.                        |
| 4    | 04 — Ethernet, IPv4/v6, ARP, ICMP | Layer 2 & 3 wire formats.                                                            | Decode a packet capture programmatically.                  |
| 5    | 05 — UDP, TCP, QUIC, SCTP  | Transport semantics. State machine, RTT, sliding window.                                   | Build a mini TCP sender/receiver that recovers from loss. |
| 6    | 06 — DNS, DHCP, NAT, HTTP, TLS, WebSocket | Application-layer grammars.                                                       | Read a TLS 1.3 handshake capture by hand.             |
| 7    | 07 — Routing & Switching   | Distance-vector, link-state, BGP, ECMP.                                                    | Simulate a BGP decision process on a small AS graph.      |
| 8    | 08 — Reliability & Retries | Idempotency, jittered backoff, circuit breaker, rate limit, hedging.                       | Build a retry+breaker client and test it under failure.   |
| 9    | 09 — Clocks & Ordering     | Lamport, vector, HLC, NTP, TrueTime, fencing.                                              | Pick the right clock for a given service.                  |
| 10   | 10 — Consensus             | 2PC, 3PC, Paxos, Raft.                                                                     | Trace a Raft leader election and log replication.          |
| 11   | 11 — Replication, Sharding, Storage | Primary-backup, chain, quorum, consistent hashing, gossip, LSM, MVCC.            | Build a mini-key-value store with read-repair.            |
| 12   | 12 — Advanced              | Saga, CRDTs, Kafka-style log, W3C trace context, structured logging.                       | Wire an end-to-end trace across services.                  |

After week 12, attempt the **capstone project** in `docs/CAPSTONE.md` and
the **interview question bank** in `docs/INTERVIEW.md`.

---

## How to use a chapter

Each chapter follows the same pattern:

1. **Header goals.** Open the chapter's `index.ts`. The `Goal:` block tells
   you what you should be able to do after the chapter. Read it first.
2. **Source.** Each module is organized as `pure functions`, then a
   `class` only when state belongs together. Run the chapter's `demo.ts`
   to see every primitive show real bytes.
3. **Tests.** `tests/chNN-*.test.ts` exercises the function with real
   vectors. Reading tests is one of the fastest ways to learn an API.
4. **STUDY guide.** `docs/STUDY/chNN.md` walks you through the chapter
   in plain prose: prerequisites, walk-through, exercises with answers,
   pitfalls, and interview questions.
5. **What to build.** The STUDY guide finishes with a "Build this"
   prompt that ties the chapter to a real component.

Do all five. If you skip the test-file reading, you will miss the most
useful examples.

---

## Self-assessment

After each chapter, ask yourself:

- Can I write the canonical wire format from scratch on paper?
- Can I name the RFC, the IEEE clause, or the paper the chapter cites?
- Can I explain the trade-offs (e.g. 4-bit vs 8-bit CRC, ECMP hashing,
  Push vs Pull gossip) to a colleague?
- Can I pick the right algorithm for a problem in a system-design
  interview?

If any answer is "no", re-read the relevant section before moving on.

---

## Beyond the 12 weeks

Once you finish, the right next move is to **build**:

- A toy TCP/IP stack on top of a TUN/TAP device.
- A Raft implementation with persistence and snapshot transfer.
- A CRDT-backed collaborative editor.
- A load tester that exercises the chapter 8 patterns.
- A Prometheus exporter for the metrics the chapter 12 Tracer emits.

These projects are not in the repo, but the chapters give you the
substrate. The capstone below is the on-ramp.
