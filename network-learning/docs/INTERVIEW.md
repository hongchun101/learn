# Interview question bank — senior / staff distributed systems

A 60-question bank across the 12 chapters, with model answers and pointers
to the chapter files. Use these to drill yourself before a senior or
staff-level interview. Each question is open-ended; the answer is the
shortest, sharpest form we could write.

For system-design drills, see [`docs/SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md).
For the chapter walkthroughs, see [`docs/STUDY/`](STUDY/).

---

## Chapter 01 — Bits, Framing, Error Coding

1. **Why length-prefix a frame when you can use a delimiter?**
   Because payloads can contain the delimiter, and escaping adds
   complexity and a new class of bugs. Length-prefix is cheap and
   deterministic.
2. **What's the difference between detection and correction?**
   A CRC detects errors; a Hamming/RS code can correct them. Detect
   with retransmit; correct on the spot at the cost of overhead.
3. **Why COBS and not just length-prefix?**
   COBS resyncs after corruption within one byte. Useful on noisy
   media (RS-485, BACnet, bootloader protocols).
4. **Why is CRC-32 good at detecting errors that the Internet
   checksum misses?**
   CRC-32 uses the full polynomial division; the Internet checksum
   is a 16-bit sum that can miss same-position bit-flips in two
   bytes.
5. **What is the minimum Hamming distance of Hamming(7,4)?**
   3. That is why it can correct 1 and detect 2.
6. **Why does Reed-Solomon matter for storage?**
   Storage media have burst errors, not bit errors. RS corrects
   symbol (byte) errors and is the standard for hard drives, DVDs,
   QR codes, and DVB.

## Chapter 02 — Encoding & Wire Formats

7. **Why does Protobuf use zig-zag for `sint32`?**
   A signed varint would always be 10 bytes for negative values;
   zig-zag puts small magnitudes in small bytes.
8. **What's the difference between TLV and KLV?**
   Conventionally, TLV uses a small type and length; KLV uses an
   OID/UL (16-bit or longer) and a BER length. SMPTE ST 336.
9. **When would you use a varint?**
   When most values are small and you want to keep the wire format
   self-describing.
10. **Trade-off: big-endian vs little-endian?**
    Big-endian is the "network" default; little-endian matches most
    CPUs. Choose once on the wire; never change.
11. **Why Q-format?**
    Many embedded DSPs lack a float unit. A Q15.16 multiply is a
    32-bit integer multiply.

## Chapter 03 — Link & Physical

12. **State Shannon's theorem.**
    Capacity = bandwidth × log2(1 + SNR).
13. **What's the Shannon limit?**
    -1.59 dB Eb/N0. Real codes approach within 0.1 dB.
14. **Why does 8b/10b use 10 bits per byte?**
    DC-balance and a guaranteed run length ≤ 5, plus a `comma`
    symbol for alignment.
15. **Why BPSK at low SNR?**
    Only one bit per symbol but the lowest required Eb/N0. Throughput
    is low; reliability is high.
16. **What is "link margin"?**
    rxPower − rxSensitivity. Positive means the link closes;
    nobody should ship a negative-margin link.

## Chapter 04 — Ethernet / IP / ARP / ICMP

17. **Why does IPv6's link-local come from the MAC?**
    Because the host can self-allocate without DHCP or SLAAC.
18. **Why is the IPv4 header checksum weak?**
    It's a 16-bit sum, not a CRC. It catches the same bit-flip in
    two bytes.
19. **What's the smallest valid IPv4 header?**
    20 bytes; IHL = 5.
20. **Why does IPv6 drop the header checksum?**
    Because the link and transport layers both have checksums.
    Removing it saves work per hop.
21. **What does ARP solve?**
    The "I have an IP, I need a MAC" problem. Without it, IP cannot
    be transmitted on a LAN.

## Chapter 05 — UDP / TCP / QUIC / SCTP

22. **Why does TCP have a 3-way handshake?**
    So both sides agree on initial sequence numbers and confirm
    two-way connectivity.
23. **Why is the RTO clamped to a minimum of 1 s?**
    Because measurement noise is huge; you don't want spurious RTOs.
24. **Why did QUIC put TCP-like behaviour on top of UDP?**
    Because middleboxes and NATs already pass UDP, and you can ship
    TLS 1.3 inside the initial handshake.
25. **Flow control vs congestion control?**
    Flow control protects the receiver; congestion control protects
    the network.
26. **Why Karn's algorithm?**
    Because you cannot tell whether an ACK was for the original or
    the retransmission.
27. **What's the difference between sliding window and congestion
    window?**
    The receiver advertises the former; the sender maintains the
    latter.

## Chapter 06 — DNS / DHCP / NAT / HTTP / TLS / WebSocket

28. **Why DNS uses port 53?**
    Historical; UDP/TCP both port 53.
29. **How does DNS work with UDP for large answers?**
    Truncation + retry over TCP.
30. **HTTP/1.1 keep-alive vs HTTP/2 streams?**
    HTTP/1.1 keep-alive is per-connection, head-of-line blocking.
    HTTP/2 multiplexes many streams over one connection.
31. **Why does TLS 1.3 hide the certificate?**
    SNI and certificate data leak which site you visit. Encrypted
    ClientHello (ECH) is still in flight.
32. **How does WebSocket frame parsing differ from HTTP?**
    WebSocket uses a 2-byte header, an optional 64-bit length, and
    an optional 32-bit masking key.

## Chapter 07 — Routing & Switching

33. **Why is OSPF link-state but RIP distance-vector?**
    Trade-off: OSPF converges faster and scales better; RIP is
    dead simple.
34. **What is split horizon?**
    Don't advertise a route back to the neighbour you learned it
    from.
35. **Why does BGP not converge instantly?**
    Path attributes must be compared in order; ties are possible.
36. **When does BGP choose eBGP over iBGP?**
    After every other tie-breaker; eBGP is preferred because it
    crosses an AS boundary.
37. **What's the role of MED?**
    Hint to neighbours about the preferred entry point.

## Chapter 08 — Reliability, Retries, Idempotency

38. **Why is full jitter the AWS recommendation?**
    It gives the lowest collision probability for synchronous
    retries.
39. **Why does a circuit breaker not replace a retry?**
    They protect against different things: retries recover from
    transient noise; breakers protect the upstream from being
    pummelled.
40. **When is hedging worse than retries?**
    When the primary is cheap and the secondary doubles the cost.
    Hedging shines for tail-latency-sensitive reads.
41. **What's the danger of an idempotency store?**
    Storage growth and races on the same key. Use a TTL and a
    status-check protocol.
42. **Why is exponential backoff alone insufficient?**
    Without jitter, the clients retry in lockstep.

## Chapter 09 — Time, Clocks, Ordering

43. **Why do vector clocks beat Lamport?**
    They detect concurrent events.
44. **Why does Spanner use TrueTime?**
    To make transactions globally serialisable without 2PC.
45. **Commit wait vs commit timestamp?**
    Commit wait is the practical mechanism; the commit timestamp is
    the record.
46. **Why are fencing tokens safer than locks?**
    Because the storage verifies the token; a stale lock holder
    cannot corrupt data.
47. **What does an NTP server emit?**
    A 48-byte packet with reference time, originate timestamp,
    receive timestamp, and transmit timestamp.

## Chapter 10 — Consensus

48. **State FLP.**
    In an asynchronous system with one faulty process, consensus is
    impossible.
49. **Why does Raft use randomised timeouts?**
    To avoid split votes.
50. **Why does Paxos need a leader?**
    It doesn't, but a leader makes it practical.
51. **What's the role of the prepare phase?**
    To fill the slot and learn any value already chosen.
52. **Why is 2PC blocking?**
    Because participants in `prepared` state cannot decide alone.
53. **Why does Raft commit only entries from the current term?**
    See §5.4.2 of the Raft paper. Earlier-term entries could be
    overwritten by a new leader.

## Chapter 11 — Replication, Sharding, Storage

54. **Why does Dynamo use `R + W > N`?**
    So any read quorum shares a node with any write quorum,
    guaranteeing the latest write.
55. **Why virtual nodes?**
    Better balance with a smaller ring.
56. **Why gossip?**
    Scales to thousands of nodes where a heartbeat protocol would
    drown the network.
57. **What's the cost of LSM?**
    Write amplification (re-write on compaction), read amplification
    (bloom + binary search), space amplification (overlap).
58. **Why MVCC?**
    Readers don't block writers.

## Chapter 12 — Advanced

59. **When is saga preferred over 2PC?**
    When the workflow is long, the participants are independent,
    and you can accept eventual consistency.
60. **Why use a CRDT?**
    When you cannot afford coordination but you need conflict-free
    convergence.

---

## Bonus: 6 system-design prompts

For full specifications, see [`docs/SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md).

1. **URL shortener.** Hash + base62; caching; read-heavy; write-light.
2. **Instant messenger.** Push vs pull; presence; ordering; fan-out.
3. **Distributed KV store.** Raft; snapshot transfer; consistent
   hashing; read-repair.
4. **Real-time leaderboard.** Sorted set per shard; merge; cache.
5. **Pub/sub.** Partitioned log; consumer groups; replay; exactly-once.
6. **Geo-distributed log.** Multi-region Raft; witnesses; CRDT or
   ap-time merging.

---

## How to drill

For each question:

1. **Speak first.** State the answer in 30 seconds.
2. **Write second.** Write the answer in 200 words or less.
3. **Implement third.** Write code that exercises the concept (one of
   the chapter exercises works).
4. **Cite fourth.** Quote the RFC / IEEE clause / paper.

If you can do all four, you can answer the question in an interview.
