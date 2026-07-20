import { describe, it, expect } from 'vitest';
import {
  encodeUdp, decodeUdp,
  encodeTcp, decodeTcp, TCP_FLAGS,
  TcpStateMachine, TCP_STATE,
  RttEstimator, SlidingWindow,
  decodeQuicHeader,
  demo as ch05Demo,
} from '../src/05-transport/index.js';

describe('05 — UDP', () => {
  it('round-trips a datagram', () => {
    const d = encodeUdp({ srcPort: 5353, dstPort: 5353, length: 12, checksum: 0x1234, payload: new Uint8Array([1, 2, 3, 4]) });
    const r = decodeUdp(d);
    expect(r.srcPort).toBe(5353);
    expect(r.dstPort).toBe(5353);
    expect(r.checksum).toBe(0x1234);
    expect(Array.from(r.payload)).toEqual([1, 2, 3, 4]);
  });
  it('rejects bad port', () => {
    expect(() => encodeUdp({ srcPort: 0x10000, dstPort: 80, length: 8, checksum: 0, payload: new Uint8Array(0) })).toThrow();
  });
});

describe('05 — TCP', () => {
  it('round-trips a SYN', () => {
    const t = encodeTcp({ srcPort: 12345, dstPort: 80, seq: 1, ack: 0, dataOffset: 5, flags: TCP_FLAGS.SYN, window: 65535, checksum: 0, urgent: 0 });
    const d = decodeTcp(t);
    expect(d.srcPort).toBe(12345);
    expect(d.dstPort).toBe(80);
    expect(d.seq).toBe(1);
    expect(d.flags & TCP_FLAGS.SYN).toBeTruthy();
  });
  it('encodes options when present', () => {
    const opts = new Uint8Array([0x02, 0x04, 0x05, 0xb4]); // MSS = 1460
    const t = encodeTcp({ srcPort: 1, dstPort: 2, seq: 0, ack: 0, dataOffset: 6, flags: TCP_FLAGS.SYN, window: 0, checksum: 0, urgent: 0, options: opts });
    const d = decodeTcp(t);
    expect(d.dataOffset).toBe(6);
    expect(d.options && Array.from(d.options)).toEqual([0x02, 0x04, 0x05, 0xb4]);
  });
  it('rejects bad dataOffset', () => {
    expect(() => encodeTcp({ srcPort: 0, dstPort: 0, seq: 0, ack: 0, dataOffset: 4, flags: 0, window: 0, checksum: 0, urgent: 0 })).toThrow();
  });
});

describe('05 — TCP state machine', () => {
  it('walks the canonical client 3-way handshake and close', () => {
    const c = new TcpStateMachine();
    c.tick('connect');
    expect(c.state).toBe(TCP_STATE.SYN_SENT);
    c.tick('synAck');
    expect(c.state).toBe(TCP_STATE.ESTABLISHED);
    c.tick('close');
    expect(c.state).toBe(TCP_STATE.FIN_WAIT_1);
    c.tick('ack');
    expect(c.state).toBe(TCP_STATE.FIN_WAIT_2);
    c.tick('fin');
    expect(c.state).toBe(TCP_STATE.TIME_WAIT);
    c.tick('timeout');
    expect(c.state).toBe(TCP_STATE.CLOSED);
  });
  it('rejects illegal transitions', () => {
    const c = new TcpStateMachine();
    expect(() => c.tick('fin')).toThrow(/illegal/);
  });
  it('walks the canonical server 3-way handshake', () => {
    const s = new TcpStateMachine();
    s.tick('listen');
    s.tick('syn');
    expect(s.state).toBe(TCP_STATE.SYN_RECEIVED);
    s.tick('ack');
    expect(s.state).toBe(TCP_STATE.ESTABLISHED);
  });
});

describe('05 — RTT estimator', () => {
  it('starts with the RFC 6298 initial RTO of 1s', () => {
    const r = new RttEstimator();
    expect(r.rto()).toBe(1);
  });
  it('smooths the first sample into SRTT', () => {
    const r = new RttEstimator();
    r.observe(0.1);
    expect(r.smoothed).toBe(0.1);
    expect(r.variance).toBe(0.05);
    expect(r.rto()).toBeGreaterThan(0.1);
  });
  it('smoothing converges toward a stable input', () => {
    const r = new RttEstimator();
    for (let i = 0; i < 20; i++) r.observe(0.1);
    expect(r.smoothed).toBeCloseTo(0.1, 4);
  });
  it('jitter increases RTTVAR and RTO', () => {
    const r1 = new RttEstimator();
    const r2 = new RttEstimator();
    for (let i = 0; i < 10; i++) r1.observe(0.1);
    for (const v of [0.05, 0.15, 0.05, 0.15, 0.05, 0.15, 0.05, 0.15, 0.05, 0.15]) r2.observe(v);
    expect(r2.rto()).toBeGreaterThan(r1.rto());
  });
});

describe('05 — Sliding window', () => {
  it('delivers in-order data immediately', () => {
    const w = new SlidingWindow();
    w.offer(0, new Uint8Array([1, 2, 3]));
    expect(w.delivered).toBe(3);
  });
  it('holds out-of-order data until gap is filled', () => {
    const w = new SlidingWindow();
    w.offer(0, new Uint8Array([1, 2, 3]));
    w.offer(5, new Uint8Array([4, 5]));
    expect(w.delivered).toBe(3);
    w.offer(3, new Uint8Array([9, 10]));
    expect(w.delivered).toBe(7);
  });
});

describe('05 — QUIC', () => {
  it('decodes a long header', () => {
    const buf = new Uint8Array([
      0xc0, 0x00, 0x00, 0x00, 0x01, // form=1, fixed=1, type=0, version=1
      0x04, ...new Uint8Array(4),   // dcid
      0x04, ...new Uint8Array(4),   // scid
    ]);
    const h = decodeQuicHeader(buf);
    if (h.form !== 1) throw new Error('expected long header');
    expect(h.type).toBe(0);
    expect(h.version).toBe(1);
    expect(h.dcidLen).toBe(4);
    expect(h.scidLen).toBe(4);
  });
  it('decodes a short header', () => {
    const buf = new Uint8Array([0x40, 1, 2, 3, 4, 5, 6, 7, 8]);
    const h = decodeQuicHeader(buf);
    expect(h.form).toBe(0);
    expect(h.dcid.length).toBe(8);
  });
});

describe('05 — demo', () => {
  it('runs end-to-end', () => {
    expect(() => ch05Demo()).not.toThrow();
  });
});
