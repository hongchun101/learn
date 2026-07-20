// =============================================================================
// Chapter 06 — Demo
// =============================================================================
import {
  encodeDnsMessage, decodeDnsMessage,
  encodeHttp1Request, decodeHttp1Request,
  encodeHttp2Frame, decodeHttp2Frame, HTTP2_FRAME,
  encodeTlsRecord, decodeTlsRecord, TLS_CONTENT_TYPE, TLS_13_HANDSHAKE_TYPE,
  encodeWsFrame, decodeWsFrame, WS_OPCODE,
  NatTable,
  encodeDhcp, decodeDhcp, DHCP_OPTIONS, DHCP_MSG_TYPE,
} from './app.js';
import { toHex } from '../01-bytes-framing/bits.js';

export function demo(): void {
  // ---- DNS ----
  const dns = encodeDnsMessage({
    id: 0x1234, qr: 0, opcode: 0, aa: false, tc: false, rd: true, ra: false, rcode: 0,
    questions: [{ qname: 'example.com', qtype: 1, qclass: 1 }],
    answers: [{ name: 'example.com', type: 1, class: 1, ttl: 60, rdata: new Uint8Array([93, 184, 216, 34]) }],
    authority: [], additional: [],
  });
  console.log('[06] dns =', toHex(dns));
  const d = decodeDnsMessage(dns);
  console.log(`[06] dns q=${d.questions[0]?.qname} a=${Array.from(d.answers[0]?.rdata ?? []).join('.')}`);

  // ---- HTTP/1.1 ----
  const req = encodeHttp1Request({
    method: 'GET', target: '/index.html', version: 'HTTP/1.1',
    headers: { host: 'example.com', 'user-agent': 'demo/1.0' },
    body: new Uint8Array(0),
  });
  const r = decodeHttp1Request(req);
  console.log(`[06] http req ${r.method} ${r.target}`);

  // ---- HTTP/2 frame ----
  const f = encodeHttp2Frame({ length: 5, type: HTTP2_FRAME.PING, flags: 0, streamId: 0, payload: new Uint8Array([1, 2, 3, 4, 5]) });
  console.log('[06] http2 =', toHex(f));
  const fd = decodeHttp2Frame(f);
  console.log(`[06] http2 type=${fd.type} streamId=${fd.streamId} payloadLen=${fd.payload.length}`);

  // ---- TLS 1.3 record ----
  const tls = encodeTlsRecord({ type: TLS_CONTENT_TYPE.HANDSHAKE, version: 0x0303, length: 4, fragment: new Uint8Array([TLS_13_HANDSHAKE_TYPE.CLIENT_HELLO, 0, 0, 1]) });
  const td = decodeTlsRecord(tls);
  console.log(`[06] tls type=${td.type} ver=0x${td.version.toString(16)} len=${td.length}`);

  // ---- WebSocket ----
  const ws = encodeWsFrame({ fin: true, rsv1: false, rsv2: false, rsv3: false, opcode: WS_OPCODE.TEXT, masked: true, payload: new TextEncoder().encode('hi') });
  const wd = decodeWsFrame(ws);
  console.log(`[06] ws op=${wd.opcode} payload=${new TextDecoder().decode(wd.payload)}`);

  // ---- NAT ----
  const nat = new NatTable(60);
  const e = nat.translate('10.0.0.5', 12345, 0);
  console.log(`[06] nat internal=10.0.0.5:12345 external=${e.externalPort}`);
  console.log(`[06] nat reverse  =${nat.reverse(e.externalPort, 0)?.internalAddr}`);

  // ---- DHCP ----
  const dhcp = encodeDhcp({
    op: 1, htype: 1, hlen: 6, hops: 0, xid: 0xaabbccdd, secs: 0, flags: 0,
    ciaddr: new Uint8Array(4), yiaddr: new Uint8Array(4), siaddr: new Uint8Array(4), giaddr: new Uint8Array(4),
    chaddr: new Uint8Array(16),
    options: new Uint8Array([
      DHCP_OPTIONS.MESSAGE_TYPE, 1, DHCP_MSG_TYPE.DISCOVER,
      DHCP_OPTIONS.END,
    ]),
  });
  const dd = decodeDhcp(dhcp);
  console.log(`[06] dhcp op=${dd.op} xid=0x${dd.xid.toString(16)} options[0]=${dd.options[0]}`);
}
