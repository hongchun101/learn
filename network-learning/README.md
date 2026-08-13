# network-learning — zero to expert in networks & distributed systems

A code-first curriculum, twelve chapters, every chapter backed by
runnable TypeScript modules with unit tests. Walks from raw bit
manipulation all the way to consensus, replication, and observability.
After finishing the chapters, exercises, and capstone you should be
able to read a protocol specification (RFC, IEEE 802.x, ITU-T) and
implement it; design a fault-tolerant, geo-distributed system;
reason about its safety and liveness properties; and pick the right
trade-off (consistency vs latency, throughput vs durability) for
your workload.

## Quick start

```bash
npm install
npm run typecheck   # strict, noUncheckedIndexedAccess
npm test            # 200+ tests across 12 chapters
npm run lint
npm run demo        # run every chapter's demo
```

## Roadmap

Start with [`docs/ROADMAP.md`](docs/ROADMAP.md) — a 12-week plan
that takes you from a `git clone` to a confident senior / staff
distributed-systems engineer. Each week lists a chapter, a
milestone, and a self-assessment.

After the chapters, work through the [`docs/CAPSTONE.md`](docs/CAPSTONE.md)
and the [`docs/INTERVIEW.md`](docs/INTERVIEW.md) and
[`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) tracks.

## Curriculum

| #  | Chapter                           | What you learn                                                                                                                          | Study guide |
| -- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 01 | Bits, Bytes, Framing, and Error Coding | Bit cursors/writers, length-prefixed and delimiter-based framing, COBS, CRC-8/16/32, Internet checksum, Hamming(7,4), Reed-Solomon RS(7,3). | [study](docs/STUDY/ch01-bytes-framing.md) |
| 02 | Encoding & Wire Formats           | Endianness (u8/u16/u32/u64/i16/i32 big- and little-endian), zig-zag, signed LEB128, SQLite varint, BER length, IEEE 754 binary16, Q-format fixed-point, TLV, KLV, Protobuf-style tag reader. | [study](docs/STUDY/ch02-encoding-wire.md) |
| 03 | Link & Physical Layer             | dB / dBm, link budget, free-space path loss, Shannon-Hartley capacity, Nyquist, modulation (BPSK to 1024-QAM), NRZ/NRZI/Manchester, 8b/10b (canonical spec tables). | [study](docs/STUDY/ch03-link-physical.md) |
| 04 | Ethernet II, ARP, IPv4/IPv6, ICMP | EUI-48 MAC, IPv4 header + options + CIDR, IPv6 header + extension headers + link-local from MAC, ARP request/reply, ICMP echo, FCS validation. | [study](docs/STUDY/ch04-ethernet-ip.md) |
| 05 | UDP, TCP, QUIC, SCTP              | UDP datagram, TCP header, TCP state machine, RTT estimator (RFC 6298), sliding window, QUIC long/short header.                          | [study](docs/STUDY/ch05-transport.md) |
| 06 | DNS, DHCP, NAT, HTTP, TLS, WebSocket | DNS message (name compression), DHCP DORA, NAT table, HTTP/1.1 request/response, HTTP/2 frame, TLS 1.3 record, WebSocket frame (RFC 6455). | [study](docs/STUDY/ch06-app-protocols.md) |
| 07 | Routing & Switching               | Distance-vector (Bellman-Ford), link-state (Dijkstra), ECMP, BGP path-vector with local-pref and AS-path policy.                       | [study](docs/STUDY/ch07-routing.md) |
| 08 | Reliability, Ordering, Idempotency | Idempotency keys, exponential backoff with four jitter strategies, circuit breaker (closed/open/half-open), token-bucket rate limiter, hedged requests. | [study](docs/STUDY/ch08-reliability-retries.md) |
| 09 | Time, Clocks, and Ordering        | Lamport clocks, vector clocks, hybrid logical clocks, NTP offset estimation, TrueTime intervals, monotonic clocks, fencing tokens.      | [study](docs/STUDY/ch09-clocks-ordering.md) |
| 10 | Consensus Foundations             | Two-phase commit, three-phase commit, single-decree Paxos, Multi-Paxos, Raft (leader election, log replication, snapshot-safe commit). | [study](docs/STUDY/ch10-consensus.md) |
| 11 | Replication, Sharding, Storage    | Primary-backup sync/async, chain replication, quorum reads/writes, consistent hashing with virtual nodes, gossip membership, LSM tree (memtable + SSTable + compaction), MVCC snapshot isolation. | [study](docs/STUDY/ch11-replication-sharding.md) |
| 12 | Advanced Distributed Systems      | Saga with compensating actions, CRDTs (G-Counter, PN-Counter, LWW-Register, OR-Set), Kafka-style partitioned log with consumer offsets, W3C Trace Context, OpenTelemetry-shaped tracer, structured logger. | [study](docs/STUDY/ch12-advanced.md) |

## Capstone

The capstone lives in [`docs/CAPSTONE.md`](docs/CAPSTONE.md) and
in `src/capstone/`. It is a small, real distributed in-memory
key-value store that ties every chapter into one runnable artifact:
bytes, framing, encoding, transport, reliability, clocks, Raft,
replication, sharding, MVCC, and observability.

## Interview prep

[`docs/INTERVIEW.md`](docs/INTERVIEW.md) is a 60-question bank
across the 12 chapters with model answers that point to the
chapter files. [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)
has six staff-level system-design drills (URL shortener, IM,
KV store, leaderboard, pub/sub, geo-distributed log) with
acceptance criteria and chapter references.

## Project layout

```
network-learning/
├── src/
│   ├── 01-bytes-framing/         BitCursor, BitWriter, length/delimiter/COBS framing, CRC, Hamming, RS
│   ├── 02-encoding-wire/         Endianness, varints, TLV, KLV, Protobuf tag reader
│   ├── 03-link-physical/         Shannon, link budget, modulation, line coding, 8b/10b
│   ├── 04-ethernet-ip/           Ethernet, IPv4, IPv6, ARP, ICMP
│   ├── 05-transport/             UDP, TCP, QUIC, RTT, sliding window
│   ├── 06-app-protocols/         DNS, DHCP, NAT, HTTP/1.1, HTTP/2, TLS, WebSocket
│   ├── 07-routing/               Bellman-Ford, Dijkstra, ECMP, BGP
│   ├── 08-reliability-retries/   Backoff, circuit breaker, token bucket, idempotency, hedged
│   ├── 09-clocks-ordering/       Lamport, vector, HLC, NTP, TrueTime, fencing
│   ├── 10-consensus/             2PC, 3PC, Paxos, Raft
│   ├── 11-replication-sharding/  Primary-backup, chain, consistent hashing, gossip, LSM, MVCC
│   ├── 12-advanced/              Saga, CRDTs, partitioned log, W3C trace context, OTel
│   └── capstone/                 tiny distributed KV store (chapters 1–12 in one file)
├── tests/                        one vitest spec per chapter + capstone
├── scripts/run-all-demos.ts      executes every chapter's demo
├── fixtures/                     static test vectors (BIPs / RFCs / IEEE)
├── docs/
│   ├── ROADMAP.md                12-week plan
│   ├── CAPSTONE.md               capstone spec
│   ├── INTERVIEW.md              interview question bank
│   ├── SYSTEM_DESIGN.md          system-design drills
│   └── STUDY/chNN-*.md           per-chapter walkthrough
├── package.json
├── tsconfig.json                 strict + noUncheckedIndexedAccess
├── tsconfig.build.json
├── vitest.config.ts
├── eslint.config.js
└── README.md
```

## How to study

1. Read the `Goal:` block at the top of each chapter's `index.ts`.
   It tells you what you should be able to do after the chapter.
2. Read the matching `docs/STUDY/chNN-*.md` walkthrough. It tells
   you what to read, what to build, and what to remember.
3. Read the chapter source. Each module is organized as a stack of
   pure functions, then a class only when state belongs together.
4. Run `npx tsx src/NN-.../demo.ts` to see every primitive produce
   real protocol bytes.
5. Run `npx vitest run tests/chNN-...` to see the same primitives
   exercised with real vectors.
6. Complete the chapter's exercises in the STUDY guide. Then
   answer its interview questions aloud.

## Quality gates

The repository passes each of these on a clean clone:

```bash
npm install
npm run typecheck      # tsc --noEmit, strict + noUncheckedIndexedAccess
npm test               # vitest run, every chapter spec + capstone
npm run lint           # eslint src tests
npm run build          # tsc -p tsconfig.build.json → dist/
npm run demo           # runs every chapter's demo (no external state)
```

## Conventions

- **Strict TypeScript**: every value has a precise type. `any` is
  forbidden. `noUncheckedIndexedAccess` is on, so every array/record
  access returns `T | undefined`.
- **Pure functions** wherever possible; classes only when state
  belongs together (sliding window, circuit breaker, gossip, etc.).
- **No network, no filesystem, no randomness from global state** in
  core logic: clocks, RNG, and time sources are injected as
  parameters so every algorithm is deterministic and testable.
- **Every claim about a protocol** is sourced inline with a citation
  (RFC number, IEEE clause, paper). Search the source for "RFC",
  "IEEE", or "Lamport" to find them.
- **The code is organized so each concept is implemented against the
  underlying primitive, then wrapped in a protocol-faithful API.**

## Learning outcomes

A learner who completes every chapter, the capstone, and the
interview question bank will be able to:

- Read a raw hex capture of any TCP/IP packet and decode every field.
- Implement framing, encoding, and error-correction for a custom wire
  protocol that interoperates with industry-standard tools.
- Reason about RTT, RTO, congestion control, and flow control in TCP
  and QUIC, and tune them with jittered backoff and circuit breakers.
- Apply 2PC, Saga, and Outbox patterns to multi-service workflows.
- Read a Paxos or Raft paper and map it to the implementations in
  chapter 10.
- Design a sharded, replicated, geo-distributed storage layer with
  CRDTs, MVCC, and LSM compaction.
- Propagate trace context across service boundaries using W3C Trace
  Context and the OpenTelemetry data model.
- Pass a senior / staff distributed-systems interview (see
  `docs/INTERVIEW.md`).
