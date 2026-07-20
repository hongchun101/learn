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
// In this file we implement:
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

// -----------------------------------------------------------------------------
// UDP
// -----------------------------------------------------------------------------

export interface UdpDatagram {
  srcPort: number;
  dstPort: number;
  length: number;
  checksum: number;
  payload: Uint8Array;
}

export function encodeUdp(d: UdpDatagram): Uint8Array {
  if (d.srcPort < 0 || d.srcPort > 0xffff) throw new RangeError('srcPort');
  if (d.dstPort < 0 || d.dstPort > 0xffff) throw new RangeError('dstPort');
  if (d.length < 8 || d.length > 0xffff) throw new RangeError('length');
  const out = new Uint8Array(8 + d.payload.length);
  out[0] = (d.srcPort >>> 8) & 0xff;
  out[1] = d.srcPort & 0xff;
  out[2] = (d.dstPort >>> 8) & 0xff;
  out[3] = d.dstPort & 0xff;
  out[4] = (d.length >>> 8) & 0xff;
  out[5] = d.length & 0xff;
  out[6] = (d.checksum >>> 8) & 0xff;
  out[7] = d.checksum & 0xff;
  out.set(d.payload, 8);
  return out;
}

export function decodeUdp(buf: Uint8Array): UdpDatagram {
  if (buf.length < 8) throw new RangeError('udp: too short');
  return {
    srcPort: (buf[0]! << 8) | buf[1]!,
    dstPort: (buf[2]! << 8) | buf[3]!,
    length: (buf[4]! << 8) | buf[5]!,
    checksum: (buf[6]! << 8) | buf[7]!,
    payload: buf.subarray(8),
  };
}

// -----------------------------------------------------------------------------
// TCP
// -----------------------------------------------------------------------------

export const TCP_FLAGS = {
  FIN: 0x01,
  SYN: 0x02,
  RST: 0x04,
  PSH: 0x08,
  ACK: 0x10,
  URG: 0x20,
  ECE: 0x40,
  CWR: 0x80,
} as const;

export interface TcpHeader {
  srcPort: number;
  dstPort: number;
  seq: number;
  ack: number;
  dataOffset: number; // header length in 32-bit words (5..15)
  flags: number;
  window: number;
  checksum: number;
  urgent: number;
  options?: Uint8Array;
}

export function encodeTcp(h: TcpHeader): Uint8Array {
  if (h.dataOffset < 5 || h.dataOffset > 15) throw new RangeError('dataOffset');
  const headerBytes = h.dataOffset * 4;
  const optionsBytes = h.options?.length ?? 0;
  if (optionsBytes > headerBytes - 20) throw new RangeError('options overflow');
  const out = new Uint8Array(headerBytes);
  out[0] = (h.srcPort >>> 8) & 0xff;
  out[1] = h.srcPort & 0xff;
  out[2] = (h.dstPort >>> 8) & 0xff;
  out[3] = h.dstPort & 0xff;
  out[4] = (h.seq >>> 24) & 0xff;
  out[5] = (h.seq >>> 16) & 0xff;
  out[6] = (h.seq >>> 8) & 0xff;
  out[7] = h.seq & 0xff;
  out[8] = (h.ack >>> 24) & 0xff;
  out[9] = (h.ack >>> 16) & 0xff;
  out[10] = (h.ack >>> 8) & 0xff;
  out[11] = h.ack & 0xff;
  out[12] = ((h.dataOffset & 0x0f) << 4) | 0;
  out[13] = h.flags & 0xff;
  out[14] = (h.window >>> 8) & 0xff;
  out[15] = h.window & 0xff;
  out[16] = (h.checksum >>> 8) & 0xff;
  out[17] = h.checksum & 0xff;
  out[18] = (h.urgent >>> 8) & 0xff;
  out[19] = h.urgent & 0xff;
  if (h.options) out.set(h.options, 20);
  return out;
}

export function decodeTcp(buf: Uint8Array): TcpHeader {
  if (buf.length < 20) throw new RangeError('tcp: too short');
  return {
    srcPort: (buf[0]! << 8) | buf[1]!,
    dstPort: (buf[2]! << 8) | buf[3]!,
    seq: ((buf[4]! << 24) | (buf[5]! << 16) | (buf[6]! << 8) | buf[7]!) >>> 0,
    ack: ((buf[8]! << 24) | (buf[9]! << 16) | (buf[10]! << 8) | buf[11]!) >>> 0,
    dataOffset: (buf[12]! >> 4) & 0x0f,
    flags: buf[13]!,
    window: (buf[14]! << 8) | buf[15]!,
    checksum: (buf[16]! << 8) | buf[17]!,
    urgent: (buf[18]! << 8) | buf[19]!,
    options: buf.length > 20 ? buf.slice(20, (buf[12]! >> 4) * 4) : undefined,
  };
}

// -----------------------------------------------------------------------------
// TCP state machine
// -----------------------------------------------------------------------------

export const TCP_STATE = {
  CLOSED: 'CLOSED',
  LISTEN: 'LISTEN',
  SYN_SENT: 'SYN_SENT',
  SYN_RECEIVED: 'SYN_RECEIVED',
  ESTABLISHED: 'ESTABLISHED',
  FIN_WAIT_1: 'FIN_WAIT_1',
  FIN_WAIT_2: 'FIN_WAIT_2',
  CLOSE_WAIT: 'CLOSE_WAIT',
  LAST_ACK: 'LAST_ACK',
  TIME_WAIT: 'TIME_WAIT',
  CLOSING: 'CLOSING',
} as const;
export type TcpState = typeof TCP_STATE[keyof typeof TCP_STATE];

const TCP_TRANSITIONS: Record<TcpState, Partial<Record<'connect' | 'listen' | 'syn' | 'synAck' | 'fin' | 'ack' | 'close' | 'timeout', TcpState>>> = {
  CLOSED:        { listen: TCP_STATE.LISTEN, connect: TCP_STATE.SYN_SENT },
  LISTEN:        { syn: TCP_STATE.SYN_RECEIVED },
  SYN_SENT:      { synAck: TCP_STATE.ESTABLISHED, close: TCP_STATE.CLOSED },
  SYN_RECEIVED:  { ack: TCP_STATE.ESTABLISHED, close: TCP_STATE.FIN_WAIT_1 },
  ESTABLISHED:   { fin: TCP_STATE.CLOSE_WAIT, close: TCP_STATE.FIN_WAIT_1 },
  FIN_WAIT_1:    { fin: TCP_STATE.CLOSING, ack: TCP_STATE.FIN_WAIT_2 },
  FIN_WAIT_2:    { fin: TCP_STATE.TIME_WAIT },
  CLOSE_WAIT:    { close: TCP_STATE.LAST_ACK },
  LAST_ACK:      { ack: TCP_STATE.CLOSED },
  CLOSING:       { ack: TCP_STATE.TIME_WAIT },
  TIME_WAIT:     { timeout: TCP_STATE.CLOSED },
};

export class TcpStateMachine {
  state: TcpState = TCP_STATE.CLOSED;
  /** Apply an event and return the new state. Throws on illegal transition. */
  tick(event: 'connect' | 'listen' | 'syn' | 'synAck' | 'fin' | 'ack' | 'close' | 'timeout'): TcpState {
    const next = TCP_TRANSITIONS[this.state][event];
    if (!next) throw new Error(`illegal TCP transition: ${event} from ${this.state}`);
    this.state = next;
    return this.state;
  }
}

// -----------------------------------------------------------------------------
// RTT estimation (Karn/Partridge + Jacobson)
// -----------------------------------------------------------------------------

/**
 * RFC 6298 RTT estimator.
 *   SRTT  = (1 - α) * SRTT  +  α * R
 *   RTTVAR = (1 - β) * RTTVAR  +  β * |SRTT - R|
 *   RTO = SRTT + max(G, K * RTTVAR)
 * with α = 1/8, β = 1/4, K = 4, G = clock granularity.
 */
export class RttEstimator {
  private srtt = -1; // -1 means "no measurement yet"
  private rttvar = -1;
  private readonly alpha = 1 / 8;
  private readonly beta = 1 / 4;
  private readonly k = 4;
  private readonly g = 0.01; // 10 ms

  /** Observe a new RTT sample R (seconds). Karn: do not observe for retransmitted segments. */
  observe(r: number) {
    if (r < 0) throw new RangeError('RTT must be non-negative');
    if (this.srtt < 0) {
      this.srtt = r;
      this.rttvar = r / 2;
    } else {
      const diff = Math.abs(this.srtt - r);
      this.rttvar = (1 - this.beta) * this.rttvar + this.beta * diff;
      this.srtt = (1 - this.alpha) * this.srtt + this.alpha * r;
    }
  }
  rto(): number {
    if (this.srtt < 0) return 1; // initial RTO (RFC 6298)
    return this.srtt + Math.max(this.g, this.k * this.rttvar);
  }

  get smoothed(): number { return this.srtt; }
  get variance(): number { return this.rttvar; }
}

// -----------------------------------------------------------------------------
// Sliding window for a byte stream (used by the receiver side of TCP).
// -----------------------------------------------------------------------------

export class SlidingWindow {
  /** Highest byte received contiguously. */
  delivered = 0;
  /** Map of out-of-order byte offset -> length. */
  private buffered = new Map<number, Uint8Array>();

  /** Offer a chunk starting at `offset`. Returns the new contiguous prefix length. */
  offer(offset: number, data: Uint8Array): number {
    if (offset <= this.delivered) {
      const skip = this.delivered - offset;
      if (skip >= data.length) return this.delivered;
      data = data.subarray(skip);
      offset = this.delivered;
    }
    if (data.length === 0) return this.delivered;
    this.buffered.set(offset, mergeOverlap(this.buffered.get(offset), data));
    // Advance delivered by the contiguous run of buffered data, byte by byte.
    while (this.buffered.has(this.delivered)) {
      const next = this.buffered.get(this.delivered)!;
      const oldDelivered = this.delivered;
      this.delivered += next.length;
      this.buffered.delete(oldDelivered);
    }
    return this.delivered;
  }

  /** Read up to `n` bytes of in-order data. */
  read(n: number): Uint8Array {
    if (n <= 0) return new Uint8Array(0);
    if (!this.buffered.has(0)) return new Uint8Array(0);
    const out = this.buffered.get(0)!;
    const take = Math.min(n, out.length);
    const result = out.subarray(0, take);
    if (take === out.length) this.buffered.delete(0);
    else this.buffered.set(0, out.subarray(take));
    return result;
  }
}


function mergeOverlap(existing: Uint8Array | undefined, incoming: Uint8Array): Uint8Array {
  if (!existing) return incoming;
  if (incoming.length === 0) return existing;
  if (incoming.length >= existing.length) return incoming;
  return existing;
}

// -----------------------------------------------------------------------------
// QUIC (RFC 9000) — minimal: long-header vs short-header form.
// -----------------------------------------------------------------------------

export interface QuicLongHeader {
  form: 1;
  fixedBit: 1;
  type: number; // 0=Initial, 1=0-RTT, 2=Handshake, 3=Retry
  version: number; // 0x00000001 for v1
  dcidLen: number;
  dcid: Uint8Array;
  scidLen: number;
  scid: Uint8Array;
}

export interface QuicShortHeader {
  form: 0;
  fixedBit: 1;
  dcid: Uint8Array;
}

export function decodeQuicHeader(buf: Uint8Array): QuicLongHeader | QuicShortHeader {
  if (buf.length === 0) throw new RangeError('quic: empty');
  const b0 = buf[0]!;
  const form = (b0 & 0x80) >>> 7;
  if (form === 1) {
    if (buf.length < 6) throw new RangeError('quic long header too short');
    const fixedBit = (b0 & 0x40) >>> 6;
    if (fixedBit !== 1) throw new Error('quic: fixed bit not set');
    const type = (b0 & 0x30) >>> 4;
    const version = (buf[1]! << 24) | (buf[2]! << 16) | (buf[3]! << 8) | buf[4]!;
    const dcidLen = buf[5]!;
    if (buf.length < 6 + dcidLen + 1) throw new RangeError('quic: dcid truncated');
    const dcid = buf.subarray(6, 6 + dcidLen);
    const scidLen = buf[6 + dcidLen]!;
    if (buf.length < 6 + dcidLen + 1 + scidLen) throw new RangeError('quic: scid truncated');
    const scid = buf.subarray(6 + dcidLen + 1, 6 + dcidLen + 1 + scidLen);
    return { form: 1, fixedBit: 1, type, version, dcidLen, dcid, scidLen, scid };
  } else {
    const fixedBit = (b0 & 0x40) >>> 6;
    if (fixedBit !== 1) throw new Error('quic: fixed bit not set');
    // The dcid length is implicit (from a previous connection).
    // For parsing convenience, take the rest of the buffer as dcid.
    return { form: 0, fixedBit: 1, dcid: buf.subarray(1) };
  }
}
