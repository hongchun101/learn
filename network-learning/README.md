# network-learning

A complete, code-first curriculum that takes you from zero to expert in
**network protocols and distributed systems**. Twelve chapters, each backed
by runnable TypeScript modules with unit tests, that walk from raw bit
manipulation all the way to consensus, replication, and observability.

The goal: after finishing the chapters, exercises, and tests you should be
able to read protocol specifications (RFCs, IEEE 802.x, ITU-T),
implement state machines, design a fault-tolerant replicated system,
reason about its safety and liveness properties, and pick the right
trade-off (consistency vs latency, throughput vs durability) for your
workload.

## Curriculum

| #  | Chapter                           | What you learn                                                                                                                          |
| -- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 01 | Bits, Bytes, Framing, and Error Coding | Bit cursors/writers, length-prefixed and delimiter-based framing, COBS, CRC-8/16/32, Internet checksum, Hamming(7,4), Reed-Solomon RS(7,3). |
| 02 | Encoding & Wire Formats           | Endianness (u8/u16/u32/u64/i16/i32 big- and little-endian), zig-zag, signed LEB128, SQLite varint, BER length, IEEE 754 binary16, Q-format fixed-point, TLV, KLV, Protobuf-style tag reader. |
| 03 | Link & Physical Layer             | dB / dBm, link budget, free-space path loss, Shannon-Hartley capacity, Nyquist, modulation (BPSK to 1024-QAM), NRZ/NRZI/Manchester, 8b/10b (canonical spec tables). |
| 04 | Ethernet II, ARP, IPv4/IPv6, ICMP | EUI-48 MAC, IPv4 header + options + CIDR, IPv6 header + extension headers + link-local from MAC, ARP request/reply, ICMP echo, FCS validation. |
| 05 | UDP, TCP, QUIC, SCTP              | UDP datagram, TCP header, TCP state machine, RTT estimator (RFC 6298), sliding window, QUIC long/short header.                              |
| 06 | DNS, DHCP, NAT, HTTP, TLS, WebSocket | DNS message (name compression), DHCP DORA, NAT table, HTTP/1.1 request/response, HTTP/2 frame, TLS 1.3 record, WebSocket frame (RFC 6455). |
| 07 | Routing & Switching               | Distance-vector (Bellman-Ford), link-state (Dijkstra), ECMP, BGP path-vector with local-pref and AS-path policy.                          |
| 08 | Reliability, Ordering, Idempotency | Idempotency keys, exponential backoff with four jitter strategies, circuit breaker (closed/open/half-open), token-bucket rate limiter, hedged requests. |
| 09 | Time, Clocks, and Ordering        | Lamport clocks, vector clocks, hybrid logical clocks, NTP offset estimation, TrueTime intervals, monotonic clocks, fencing tokens.        |
| 10 | Consensus Foundations             | Two-phase commit, three-phase commit, single-decree Paxos, Multi-Paxos, Raft (leader election, log replication, snapshot-safe commit). |
| 11 | Replication, Sharding, Storage    | Primary-backup sync/async, chain replication, quorum reads/writes, consistent hashing with virtual nodes, gossip membership, LSM tree (memtable + SSTable + compaction), MVCC snapshot isolation. |
| 12 | Advanced Distributed Systems      | Saga with compensating actions, CRDTs (G-Counter, PN-Counter, LWW-Register, OR-Set), Kafka-style partitioned log with consumer offsets, W3C Trace Context, OpenTelemetry-shaped tracer, structured logger. |

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
│   └── 12-advanced/              Saga, CRDTs, partitioned log, W3C trace context, OTel
├── tests/                        one vitest spec per chapter (ch01..ch12)
├── scripts/run-all-demos.ts      executes every chapter's demo
├── fixtures/                     static test vectors (BIPs / RFCs / IEEE)
├── package.json
├── tsconfig.json                 strict + noUncheckedIndexedAccess
├── tsconfig.build.json
├── vitest.config.ts
├── eslint.config.js
└── README.md
```

## How to study

1. Read the chapter header in the source file. Each starts with a
   `Goal:` block that lists the protocol concepts the chapter teaches.
2. Read the chapters in order — `02` builds on the bytes from `01`,
   `04` uses bit manipulation from `01`, `08` uses idempotency keys
   that ride on `06`'s HTTP semantics, `10` uses the clocks from `09`,
   and so on.
3. After each chapter, run `npx vitest run tests/ch<NN>-...` to check
   your understanding by reading what is asserted.
4. Then run `npm run demo` (or `npx tsx scripts/run-all-demos.ts`) to
   watch every chapter's demo print real protocol bytes.

## Quality gates

The repository passes each of these on a clean clone:

```bash
npm install
npm run typecheck      # tsc --noEmit, strict + noUncheckedIndexedAccess
npm test               # vitest run, every chapter spec
npm run lint           # eslint src tests
npm run build          # tsc -p tsconfig.build.json → dist/
npm run demo           # runs every chapter's demo (no external state)
```

## Conventions

- **Strict TypeScript**: every value has a precise type. `any` is
  forbidden. `noUncheckedIndexedAccess` is on, so every array/record
  access returns `T | undefined`.
- **Pure functions** wherever possible; classes only when state belongs
  together (sliding window, circuit breaker, gossip, etc.).
- **No network, no filesystem, no randomness from global state** in core
  logic: clocks, RNG, and time sources are injected as parameters so
  every algorithm is deterministic and testable.
- **Every claim about a protocol** is sourced inline with a citation
  (RFC number, IEEE clause, paper). Search the source for "RFC", "IEEE",
  or "Lamport" to find them.
- **The code is organized so each concept is implemented against the
  underlying primitive, then wrapped in a protocol-faithful API.**

## Learning outcomes

A learner who completes every chapter and exercise will be able to:

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
