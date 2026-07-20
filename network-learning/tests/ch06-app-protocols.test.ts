import { describe, it, expect } from 'vitest';
import {
  encodeDnsName, decodeDnsName, encodeDnsMessage, decodeDnsMessage,
  encodeHttp1Request, decodeHttp1Request, encodeHttp1Response, decodeHttp1Response,
  encodeHttp2Frame, decodeHttp2Frame, HTTP2_FRAME,
  encodeTlsRecord, decodeTlsRecord, TLS_CONTENT_TYPE,
  encodeWsFrame, decodeWsFrame, WS_OPCODE,
  NatTable, encodeDhcp, decodeDhcp, DHCP_MSG_TYPE, DHCP_OPTIONS,
  demo as ch06Demo,
} from '../src/06-app-protocols/index.js';

describe('06 — DNS', () => {
  it('encodes and decodes a name', () => {
    const enc = encodeDnsName('www.example.com');
    expect(enc).toEqual(new Uint8Array([3, 0x77, 0x77, 0x77, 7, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 3, 0x63, 0x6f, 0x6d, 0]));
    const dec = decodeDnsName(enc, 0);
    expect(dec.name).toBe('www.example.com');
  });
  it('round-trips a query', () => {
    const msg = encodeDnsMessage({
      id: 0xabcd, qr: 0, opcode: 0, aa: false, tc: false, rd: true, ra: false, rcode: 0,
      questions: [{ qname: 'example.com', qtype: 1, qclass: 1 }],
      answers: [], authority: [], additional: [],
    });
    const d = decodeDnsMessage(msg);
    expect(d.id).toBe(0xabcd);
    expect(d.rd).toBe(true);
    expect(d.questions[0]?.qname).toBe('example.com');
  });
  it('round-trips a response with A record', () => {
    const msg = encodeDnsMessage({
      id: 0x1234, qr: 1, opcode: 0, aa: true, tc: false, rd: true, ra: true, rcode: 0,
      questions: [{ qname: 'example.com', qtype: 1, qclass: 1 }],
      answers: [{ name: 'example.com', type: 1, class: 1, ttl: 300, rdata: new Uint8Array([1, 2, 3, 4]) }],
      authority: [], additional: [],
    });
    const d = decodeDnsMessage(msg);
    expect(d.aa).toBe(true);
    expect(d.ra).toBe(true);
    expect(Array.from(d.answers[0]?.rdata ?? [])).toEqual([1, 2, 3, 4]);
  });
});

describe('06 — HTTP/1.1', () => {
  it('round-trips a request', () => {
    const req = encodeHttp1Request({
      method: 'POST', target: '/x', version: 'HTTP/1.1',
      headers: { host: 'a.b', 'content-length': '5' },
      body: new Uint8Array([1, 2, 3, 4, 5]),
    });
    const d = decodeHttp1Request(req);
    expect(d.method).toBe('POST');
    expect(d.target).toBe('/x');
    expect(d.headers['host']).toBe('a.b');
    expect(Array.from(d.body)).toEqual([1, 2, 3, 4, 5]);
  });
  it('round-trips a response', () => {
    const res = encodeHttp1Response({
      version: 'HTTP/1.1', status: 200, reason: 'OK',
      headers: { 'content-type': 'text/plain', 'content-length': '2' },
      body: new Uint8Array([104, 105]),
    });
    const d = decodeHttp1Response(res);
    expect(d.status).toBe(200);
    expect(d.reason).toBe('OK');
    expect(Array.from(d.body)).toEqual([104, 105]);
  });
});

describe('06 — HTTP/2', () => {
  it('round-trips a PING frame', () => {
    const f = encodeHttp2Frame({ length: 8, type: HTTP2_FRAME.PING, flags: 0, streamId: 0, payload: new Uint8Array(8) });
    const d = decodeHttp2Frame(f);
    expect(d.type).toBe(HTTP2_FRAME.PING);
    expect(d.streamId).toBe(0);
  });
  it('preserves stream id bits', () => {
    const f = encodeHttp2Frame({ length: 5, type: HTTP2_FRAME.DATA, flags: 0, streamId: 0x7fffffff, payload: new Uint8Array(5) });
    const d = decodeHttp2Frame(f);
    expect(d.streamId).toBe(0x7fffffff);
  });
});

describe('06 — TLS 1.3 record', () => {
  it('round-trips a record', () => {
    const r = encodeTlsRecord({ type: TLS_CONTENT_TYPE.APPLICATION_DATA, version: 0x0303, length: 3, fragment: new Uint8Array([1, 2, 3]) });
    const d = decodeTlsRecord(r);
    expect(d.type).toBe(TLS_CONTENT_TYPE.APPLICATION_DATA);
    expect(d.length).toBe(3);
  });
});

describe('06 — WebSocket', () => {
  it('round-trips a small masked text frame', () => {
    const f = encodeWsFrame({ fin: true, rsv1: false, rsv2: false, rsv3: false, opcode: WS_OPCODE.TEXT, masked: true, payload: new TextEncoder().encode('hi') });
    const d = decodeWsFrame(f);
    expect(d.opcode).toBe(WS_OPCODE.TEXT);
    expect(d.masked).toBe(true);
    expect(new TextDecoder().decode(d.payload)).toBe('hi');
  });
  it('round-trips a 200-byte binary frame with extended length', () => {
    const payload = new Uint8Array(200).fill(0x42);
    const f = encodeWsFrame({ fin: true, rsv1: false, rsv2: false, rsv3: false, opcode: WS_OPCODE.BINARY, masked: false, payload });
    const d = decodeWsFrame(f);
    expect(d.payload.length).toBe(200);
    expect(d.payload[0]).toBe(0x42);
  });
});

describe('06 — NAT', () => {
  it('translates and reverses', () => {
    const nat = new NatTable(60);
    const e1 = nat.translate('10.0.0.5', 1234, 0);
    const e2 = nat.translate('10.0.0.6', 5678, 0);
    expect(e1.externalPort).not.toBe(e2.externalPort);
    expect(nat.reverse(e1.externalPort, 0)?.internalAddr).toBe('10.0.0.5');
  });
  it('expires old entries', () => {
    const nat = new NatTable(10);
    const e = nat.translate('10.0.0.1', 1, 0);
    expect(nat.reverse(e.externalPort, 0)).toBeDefined();
    expect(nat.reverse(e.externalPort, 100)).toBeUndefined();
  });
});

describe('06 — DHCP', () => {
  it('round-trips a DISCOVER', () => {
    const m = encodeDhcp({
      op: 1, htype: 1, hlen: 6, hops: 0, xid: 0xdeadbeef, secs: 0, flags: 0,
      ciaddr: new Uint8Array(4), yiaddr: new Uint8Array(4), siaddr: new Uint8Array(4), giaddr: new Uint8Array(4),
      chaddr: new Uint8Array(16),
      options: new Uint8Array([DHCP_OPTIONS.MESSAGE_TYPE, 1, DHCP_MSG_TYPE.DISCOVER, DHCP_OPTIONS.END]),
    });
    const d = decodeDhcp(m);
    expect(d.op).toBe(1);
    expect(d.xid).toBe(0xdeadbeef);
    expect(d.options[0]).toBe(DHCP_OPTIONS.MESSAGE_TYPE);
    expect(d.options[2]).toBe(DHCP_MSG_TYPE.DISCOVER);
  });
});

describe('06 — demo', () => {
  it('runs end-to-end', () => {
    expect(() => ch06Demo()).not.toThrow();
  });
});
