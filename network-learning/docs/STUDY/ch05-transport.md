# Chapter 05 — UDP, TCP, QUIC, SCTP

## Goal

After this chapter you should be able to:

- Decode a UDP and a TCP header by hand.
- Walk the TCP state machine on paper.
- Implement and reason about RFC 6298 RTT estimation.
- Read a QUIC long header / short header.
- Explain head-of-line blocking and why QUIC exists.

## Prerequisites

Chapter 04 (IPv4 pseudohdr, IPv6 pseudohdr).

## Walkthrough

1. **UDP.** 8-byte header. The checksum is optional in IPv4 but
   mandatory in IPv6.
2. **TCP.** 20-byte minimum. The `flags` field carries URG/ACK/PSH/RST/
   SYN/FIN. The window is 16 bits (scaled in modern TCP).
3. **State machine.** `TcpStateMachine` has the canonical 11 states
   (LISTEN, SYN_SENT, SYN_RECEIVED, ESTABLISHED, FIN_WAIT_1,
   FIN_WAIT_2, CLOSE_WAIT, CLOSING, LAST_ACK, TIME_WAIT, CLOSED).
4. **RTT / RTO.** `RttEstimator` implements RFC 6298:
   - `SRTT = (1 - α) * SRTT + α * RTT`, α = 1/8.
   - `RTTVAR = (1 - β) * RTTVAR + β * |SRTT - RTT|`, β = 1/4.
   - `RTO = SRTT + max(G, 4 * RTTVAR)`, K = 4.
   - Karn's algorithm: don't measure RTT on retransmitted segments.
5. **Sliding window.** `SlidingWindow` accepts in-order bytes, merges
   out-of-order chunks, and reports the next expected byte.
6. **QUIC.** `decodeQuicHeader` parses the long header (Initial,
   0-RTT, Handshake, Retry) and the short header (1-RTT).

Run `npx tsx src/05-transport/demo.ts` for the lot.

## Exercises

1. **TCP flags.** Encode a SYN with sequence number 1000. What flags
   are set?
2. **3-way handshake.** Walk the state machine through
   `connect()` → SYN → SYN+ACK → ACK → ESTABLISHED.
3. **RTT.** Assume three samples: 100 ms, 120 ms, 90 ms. What does
   the RTT estimator converge to?
4. **Sliding window.** Drop a packet, deliver two out-of-order chunks,
   then deliver the missing one. Confirm the merged buffer.
5. **QUIC.** Decode a long header and a short header. Note the
   packet-number field.

### Answers (sketch)

1. SYN bit; sequence 1000.
2. LISTEN → SYN_SENT → SYN_RECEIVED → ESTABLISHED.
3. SRTT converges to ~100 ms; RTTVAR to ~10 ms; RTO to ~140 ms.
4. Sliding window merges; the next-expected byte is reported.
5. Long header has DCID + SCID; short header has only DCID.

## Common pitfalls

- **Time-wait.** A socket that closes first enters TIME_WAIT for 2×MSL
  to drain stray packets. Forgetting it gives "address in use" errors.
- **RTO backoff.** RTO doubles on each retransmission up to a cap.
- **Head-of-line blocking.** TCP streams force ordering. One lost
  packet blocks every subsequent byte. QUIC streams are independent.
- **Sliding window vs congestion window.** The receiver advertises the
  former; the sender maintains the latter. They are not the same.

## Interview questions

1. **Why does TCP have a 3-way handshake?** So both sides agree on
   initial sequence numbers and confirm two-way connectivity.
2. **Why is the RTO clamped to a minimum of 1 s?** Because measurement
   noise is huge; you don't want spurious RTOs.
3. **Why did QUIC put TCP-like behaviour on top of UDP?** Because
   middleboxes and NATs already pass UDP, and you can ship TLS 1.3
   inside the initial handshake.
4. **What's the difference between flow control and congestion
   control?** Flow control protects the receiver; congestion control
   protects the network.
5. **Why Karn's algorithm?** Because you cannot tell whether an ACK
   was for the original or the retransmission.

## What to build

A `toyTcpClient` that opens a connection, sends a request, retries
on timeout, and decodes the response. Use `RttEstimator` and the
sliding window. Then refactor to use `QUIC` headers.

## References

- RFC 793 (TCP).
- RFC 6298 (RTT).
- RFC 9000 (QUIC).
- RFC 4960 (SCTP).
