// =============================================================================
// Chapter 05 — UDP, TCP, QUIC, SCTP
// =============================================================================
// Goal: the transport layer turns an unreliable byte stream (IP) into something
// applications can build on. UDP is the no-frills choice; TCP adds
// reliability, ordering, flow control, and congestion control; QUIC does the
// same over UDP, getting rid of the head-of-line blocking; SCTP is the
// multi-streaming, multi-homing cousin used in telecom and WebRTC data
// channels.
//
// We implement:
//   * UDP header (8 bytes: src port, dst port, length, checksum).
//   * TCP header (20 bytes minimum; seq, ack, flags, window, urgent, options).
//   * TCP state machine (RFC 793) — driven by `tick()` events.
//   * A sliding-window retransmission timer with Karn/Partridge RTT estimator
//     and Jacobson's algorithm for RTO computation.
//   * QUIC long-header / short-header parsing (RFC 9000) — minimum viable
//     to demonstrate the wire format.
//
// SCTP is referenced but not fully implemented; the chapter notes where its
// design differs from TCP's.
// =============================================================================
//
// STUDY (read alongside docs/STUDY/ch05-transport.md)
// -----------------------------------------------------------------------------
// Prerequisites: Chapter 04 (IPv4 pseudohdr, IPv6 pseudohdr).
// Why it matters: every inter-service call crosses a transport. Whether you
// pick UDP, TCP, or QUIC decides head-of-line blocking, latency, and the
// surface area of your failure modes. This chapter gives you the wire format
// and the algorithms (RTT, RTO, sliding window) you'll instrument and tune
// in production.
// Key invariants:
//   * TCP is reliable (acks), ordered (sequence numbers), and flow-controlled
//     (window). QUIC is the same plus per-stream independence, no head-of-line
//     blocking.
//   * RFC 6298 RTO: RTO = SRTT + max(G, 4 * RTTVAR); K = 4, α = 1/8, β = 1/4.
//   * Karn's algorithm: do not measure RTT on retransmitted segments.
//   * RTO backoff doubles on each retransmission up to a cap.
// Common pitfalls:
//   * Time-wait: a socket that closes first enters TIME_WAIT for 2×MSL.
//   * Confusing flow control (receiver) with congestion control (network).
//   * Applying head-of-line reasoning to QUIC — its streams are independent.
//   * Forgetting the UDP checksum is optional in IPv4 but mandatory in IPv6.
// Interview-ready summary: I can decode a TCP header, walk the state machine,
// implement RTT estimation, and explain why QUIC exists.
// -----------------------------------------------------------------------------
// Study guide: docs/STUDY/ch05-transport.md
// Test:        tests/ch05-transport.test.ts
// Demo:        npx tsx src/05-transport/demo.ts
// =============================================================================

export {
  encodeUdp, decodeUdp,
  encodeTcp, decodeTcp, TCP_FLAGS,
  TcpStateMachine, TCP_STATE,
  RttEstimator, SlidingWindow,
  decodeQuicHeader,
} from './transport.js';
export type { UdpDatagram, TcpHeader, TcpState, QuicLongHeader, QuicShortHeader } from './transport.js';
export { demo } from './demo.js';
