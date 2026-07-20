// =============================================================================
// Chapter 06 — Application-Layer Protocols
// =============================================================================
// Goal: a tour of the protocols applications actually speak. We focus on the
// text/binary grammar of each protocol's messages — sufficient to read
// captures, write clients, and reason about security.
//
//   * DNS  (RFC 1035 + DNSSEC RFC 4033)
//   * DHCP (RFC 2131 / 2132)
//   * HTTP/1.1 (RFC 9110/9112), HTTP/2 (RFC 9113) framing
//   * TLS 1.3 (RFC 8446) — handshake summary, record format
//   * WebSocket (RFC 6455)
//
// NAT is conceptual here: we cover the address/port translation table
// structure without a full wire protocol (it's part of IP-layer devices).
// =============================================================================

// -----------------------------------------------------------------------------
// DNS message
// -----------------------------------------------------------------------------

export type DnsClass = 'IN' | 'CH' | number;
export type DnsType = 'A' | 'AAAA' | 'CNAME' | 'NS' | 'MX' | 'TXT' | 'SOA' | 'PTR' | 'SRV' | number;

export interface DnsQuestion {
  qname: string;
  qtype: DnsType;
  qclass: DnsClass;
}

export interface DnsResourceRecord {
  name: string;
  type: DnsType;
  class: DnsClass;
  ttl: number;
  rdata: Uint8Array;
}

export interface DnsMessage {
  id: number;
  qr: 0 | 1;
  opcode: number;
  aa: boolean;
  tc: boolean;
  rd: boolean;
  ra: boolean;
  rcode: number;
  questions: DnsQuestion[];
  answers: DnsResourceRecord[];
  authority: DnsResourceRecord[];
  additional: DnsResourceRecord[];
}

/** Encode a DNS name (sequence of labels) into wire form. */
export function encodeDnsName(name: string): Uint8Array {
  const parts = name.split('.').filter((p) => p.length > 0);
  const out: number[] = [];
  for (const p of parts) {
    if (p.length > 63) throw new RangeError('label > 63 octets');
    out.push(p.length);
    for (let i = 0; i < p.length; i++) out.push(p.charCodeAt(i) & 0xff);
  }
  out.push(0);
  return new Uint8Array(out);
}

/** Decode a DNS name from a wire buffer starting at `offset`. Supports compression. */
export function decodeDnsName(buf: Uint8Array, offset: number): { name: string; next: number } {
  const labels: string[] = [];
  let pos = offset;
  let jumped = false;
  let returnTo = -1;
  let safety = 0;
  while (safety++ < 256) {
    if (pos >= buf.length) throw new RangeError('dns name: out of bounds');
    const len = buf[pos]!;
    if (len === 0) {
      pos++;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      // Compression pointer. Read 14-bit offset and follow it.
      if (pos + 1 >= buf.length) throw new RangeError('dns name: truncated pointer');
      const target = ((len & 0x3f) << 8) | buf[pos + 1]!;
      if (!jumped) { returnTo = pos + 2; jumped = true; }
      pos = target;
      continue;
    }
    pos++;
    if (pos + len > buf.length) throw new RangeError('dns name: truncated label');
    labels.push(new TextDecoder().decode(buf.subarray(pos, pos + len)));
    pos += len;
  }
  return { name: labels.join('.'), next: jumped ? returnTo : pos };
}

export function encodeDnsMessage(m: DnsMessage): Uint8Array {
  // Build a flat byte buffer. We compute the body in one pass.
  const parts: Uint8Array[] = [];
  // Header
  const hdr = new Uint8Array(12);
  hdr[0] = (m.id >>> 8) & 0xff;
  hdr[1] = m.id & 0xff;
  const b2 = (m.qr << 7) | ((m.opcode & 0x0f) << 3) | ((m.aa ? 1 : 0) << 2) | ((m.tc ? 1 : 0) << 1) | (m.rd ? 1 : 0);
  hdr[2] = b2;
  hdr[3] = ((m.ra ? 1 : 0) << 7) | (m.rcode & 0x0f);
  hdr[4] = (m.questions.length >>> 8) & 0xff;
  hdr[5] = m.questions.length & 0xff;
  hdr[6] = (m.answers.length >>> 8) & 0xff;
  hdr[7] = m.answers.length & 0xff;
  hdr[8] = (m.authority.length >>> 8) & 0xff;
  hdr[9] = m.authority.length & 0xff;
  hdr[10] = (m.additional.length >>> 8) & 0xff;
  hdr[11] = m.additional.length & 0xff;
  parts.push(hdr);

  for (const q of m.questions) {
    parts.push(encodeDnsName(q.qname));
    const tail = new Uint8Array(4);
    tail[0] = (q.qtype as number) >>> 8;
    tail[1] = (q.qtype as number) & 0xff;
    tail[2] = (q.qclass as number) >>> 8;
    tail[3] = (q.qclass as number) & 0xff;
    parts.push(tail);
  }

  for (const r of [...m.answers, ...m.authority, ...m.additional]) {
    parts.push(encodeDnsName(r.name));
    const tail = new Uint8Array(10 + r.rdata.length);
    tail[0] = (r.type as number) >>> 8;
    tail[1] = (r.type as number) & 0xff;
    tail[2] = (r.class as number) >>> 8;
    tail[3] = (r.class as number) & 0xff;
    tail[4] = (r.ttl >>> 24) & 0xff;
    tail[5] = (r.ttl >>> 16) & 0xff;
    tail[6] = (r.ttl >>> 8) & 0xff;
    tail[7] = r.ttl & 0xff;
    tail[8] = (r.rdata.length >>> 8) & 0xff;
    tail[9] = r.rdata.length & 0xff;
    tail.set(r.rdata, 10);
    parts.push(tail);
  }

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export function decodeDnsMessage(buf: Uint8Array): DnsMessage {
  if (buf.length < 12) throw new RangeError('dns: too short');
  const m: DnsMessage = {
    id: (buf[0]! << 8) | buf[1]!,
    qr: ((buf[2]! >> 7) & 1) as 0 | 1,
    opcode: (buf[2]! >> 3) & 0x0f,
    aa: ((buf[2]! >> 2) & 1) === 1,
    tc: ((buf[2]! >> 1) & 1) === 1,
    rd: (buf[2]! & 1) === 1,
    ra: ((buf[3]! >> 7) & 1) === 1,
    rcode: buf[3]! & 0x0f,
    questions: [], answers: [], authority: [], additional: [],
  };
  const qdcount = (buf[4]! << 8) | buf[5]!;
  const ancount = (buf[6]! << 8) | buf[7]!;
  const nscount = (buf[8]! << 9) | buf[9]!;
  const arcount = (buf[10]! << 8) | buf[11]!;
  // Adjust: nscount should use buf[8] not buf[9]! << 9
  const realNscount = (buf[8]! << 8) | buf[9]!;
  let off = 12;
  for (let i = 0; i < qdcount; i++) {
    const { name, next } = decodeDnsName(buf, off);
    off = next;
    if (off + 4 > buf.length) throw new RangeError('dns: truncated question');
    m.questions.push({
      qname: name,
      qtype: ((buf[off]! << 8) | buf[off + 1]!) as DnsType,
      qclass: ((buf[off + 2]! << 8) | buf[off + 3]!) as DnsClass,
    });
    off += 4;
  }
  const readRrs = (count: number) => {
    for (let i = 0; i < count; i++) {
      const { name, next } = decodeDnsName(buf, off);
      off = next;
      if (off + 10 > buf.length) throw new RangeError('dns: truncated RR');
      const rdlen = (buf[off + 8]! << 8) | buf[off + 9]!;
      if (off + 10 + rdlen > buf.length) throw new RangeError('dns: truncated rdata');
      m.answers.push({
        name,
        type: ((buf[off]! << 8) | buf[off + 1]!) as DnsType,
        class: ((buf[off + 2]! << 8) | buf[off + 3]!) as DnsClass,
        ttl: (buf[off + 4]! << 24) | (buf[off + 5]! << 16) | (buf[off + 6]! << 8) | buf[off + 7]!,
        rdata: buf.slice(off + 10, off + 10 + rdlen),
      });
      off += 10 + rdlen;
    }
  };
  readRrs(ancount);
  readRrs(realNscount);
  readRrs(arcount);
  // Silence unused var warning
  void nscount;
  return m;
}

// -----------------------------------------------------------------------------
// HTTP/1.1 messages
// -----------------------------------------------------------------------------

export interface HttpRequest {
  method: string;
  target: string;
  version: 'HTTP/0.9' | 'HTTP/1.0' | 'HTTP/1.1' | 'HTTP/2.0' | 'HTTP/3.0';
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface HttpResponse {
  version: 'HTTP/0.9' | 'HTTP/1.0' | 'HTTP/1.1' | 'HTTP/2.0' | 'HTTP/3.0';
  status: number;
  reason: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

function text(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}
function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Encode an HTTP/1.1 request. */
export function encodeHttp1Request(req: HttpRequest): Uint8Array {
  const lines: string[] = [`${req.method} ${req.target} ${req.version}`];
  for (const [k, v] of Object.entries(req.headers)) lines.push(`${k}: ${v}`);
  const head = bytes(lines.join('\r\n') + '\r\n\r\n');
  const out = new Uint8Array(head.length + req.body.length);
  out.set(head, 0);
  out.set(req.body, head.length);
  return out;
}

export function decodeHttp1Request(buf: Uint8Array): HttpRequest {
  const head = text(buf).split('\r\n\r\n')[0]!;
  const lines = head.split('\r\n');
  const [method = '', target = '', version = 'HTTP/1.1'] = lines[0]!.split(' ');
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i]!.indexOf(':');
    if (idx < 0) continue;
    headers[lines[i]!.slice(0, idx).trim().toLowerCase()] = lines[i]!.slice(idx + 1).trim();
  }
  const bodyStart = text(buf).indexOf('\r\n\r\n') + 4;
  return { method, target, version: version as HttpRequest['version'], headers, body: buf.subarray(bodyStart) };
}

export function encodeHttp1Response(res: HttpResponse): Uint8Array {
  const lines: string[] = [`${res.version} ${res.status} ${res.reason}`];
  for (const [k, v] of Object.entries(res.headers)) lines.push(`${k}: ${v}`);
  const head = bytes(lines.join('\r\n') + '\r\n\r\n');
  const out = new Uint8Array(head.length + res.body.length);
  out.set(head, 0);
  out.set(res.body, head.length);
  return out;
}

export function decodeHttp1Response(buf: Uint8Array): HttpResponse {
  const head = text(buf).split('\r\n\r\n')[0]!;
  const lines = head.split('\r\n');
  const m = lines[0]!.match(/^(\S+) (\d+) (.*)$/);
  if (!m) throw new Error('http: bad status line');
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i]!.indexOf(':');
    if (idx < 0) continue;
    headers[lines[i]!.slice(0, idx).trim().toLowerCase()] = lines[i]!.slice(idx + 1).trim();
  }
  const bodyStart = text(buf).indexOf('\r\n\r\n') + 4;
  return { version: m[1] as HttpResponse['version'], status: Number(m[2]), reason: m[3] ?? '', headers, body: buf.subarray(bodyStart) };
}

// -----------------------------------------------------------------------------
// HTTP/2 framing (RFC 9113)
// -----------------------------------------------------------------------------

export const HTTP2_FRAME = {
  DATA: 0x0,
  HEADERS: 0x1,
  PRIORITY: 0x2,
  RST_STREAM: 0x3,
  SETTINGS: 0x4,
  PUSH_PROMISE: 0x5,
  PING: 0x6,
  GOAWAY: 0x7,
  WINDOW_UPDATE: 0x8,
  CONTINUATION: 0x9,
} as const;

export interface Http2Frame {
  length: number;
  type: number;
  flags: number;
  streamId: number;
  payload: Uint8Array;
}

export function encodeHttp2Frame(f: Http2Frame): Uint8Array {
  if (f.length > 0xffffff) throw new RangeError('http2: frame too large');
  if (f.streamId < 0 || f.streamId > 0x7fffffff) throw new RangeError('http2: stream id');
  const out = new Uint8Array(9 + f.payload.length);
  out[0] = (f.length >>> 16) & 0xff;
  out[1] = (f.length >>> 8) & 0xff;
  out[2] = f.length & 0xff;
  out[3] = f.type & 0xff;
  out[4] = f.flags & 0xff;
  out[5] = (f.streamId >>> 24) & 0x7f;
  out[6] = (f.streamId >>> 16) & 0xff;
  out[7] = (f.streamId >>> 8) & 0xff;
  out[8] = f.streamId & 0xff;
  out.set(f.payload, 9);
  return out;
}

export function decodeHttp2Frame(buf: Uint8Array): Http2Frame {
  if (buf.length < 9) throw new RangeError('http2: frame too short');
  const length = (buf[0]! << 16) | (buf[1]! << 8) | buf[2]!;
  const type = buf[3]!;
  const flags = buf[4]!;
  const streamId = ((buf[5]! & 0x7f) << 24) | (buf[6]! << 16) | (buf[7]! << 8) | buf[8]!;
  if (buf.length < 9 + length) throw new RangeError('http2: truncated frame');
  return { length, type, flags, streamId, payload: buf.subarray(9, 9 + length) };
}

// -----------------------------------------------------------------------------
// TLS 1.3 record (RFC 8446)
// -----------------------------------------------------------------------------

export const TLS_CONTENT_TYPE = {
  CHANGE_CIPHER_SPEC: 20,
  ALERT: 21,
  HANDSHAKE: 22,
  APPLICATION_DATA: 23,
} as const;

export const TLS_13_HANDSHAKE_TYPE = {
  CLIENT_HELLO: 1,
  SERVER_HELLO: 2,
  NEW_SESSION_TICKET: 4,
  ENCRYPTED_EXTENSIONS: 8,
  CERTIFICATE: 11,
  CERTIFICATE_VERIFY: 15,
  FINISHED: 20,
} as const;

export interface TlsRecord {
  type: number;
  version: number; // legacy version (0x0303 for TLS 1.3)
  length: number;
  fragment: Uint8Array;
}

export function encodeTlsRecord(r: TlsRecord): Uint8Array {
  if (r.length > 0x3fff) throw new RangeError('tls: record too large');
  if (r.fragment.length !== r.length) throw new Error('tls: length mismatch');
  const out = new Uint8Array(5 + r.length);
  out[0] = r.type;
  out[1] = (r.version >>> 8) & 0xff;
  out[2] = r.version & 0xff;
  out[3] = (r.length >>> 8) & 0xff;
  out[4] = r.length & 0xff;
  out.set(r.fragment, 5);
  return out;
}

export function decodeTlsRecord(buf: Uint8Array): TlsRecord {
  if (buf.length < 5) throw new RangeError('tls: too short');
  const type = buf[0]!;
  const version = (buf[1]! << 8) | buf[2]!;
  const length = (buf[3]! << 8) | buf[4]!;
  if (buf.length < 5 + length) throw new RangeError('tls: truncated');
  return { type, version, length, fragment: buf.subarray(5, 5 + length) };
}

// -----------------------------------------------------------------------------
// WebSocket frame (RFC 6455)
// -----------------------------------------------------------------------------

export const WS_OPCODE = {
  CONTINUATION: 0,
  TEXT: 1,
  BINARY: 2,
  CLOSE: 8,
  PING: 9,
  PONG: 10,
} as const;

export interface WsFrame {
  fin: boolean;
  rsv1: boolean;
  rsv2: boolean;

  rsv3: boolean;
  opcode: number;
  masked: boolean;
  payload: Uint8Array;
}

export function encodeWsFrame(f: WsFrame): Uint8Array {
  if (f.payload.length > 0x7fffffff) throw new RangeError('ws: payload too large');
  let b0 = f.opcode & 0x0f;
  if (f.fin) b0 |= 0x80;
  if (f.rsv1) b0 |= 0x40;
  if (f.rsv2) b0 |= 0x20;
  if (f.rsv3) b0 |= 0x10;

  let b1 = 0;
  if (f.masked) b1 |= 0x80;

  let lenBytes: number[] = [];
  const len = f.payload.length;
  if (len < 126) {
    b1 |= len & 0x7f;
  } else if (len < 0x10000) {
    b1 |= 126;
    lenBytes = [(len >>> 8) & 0xff, len & 0xff];
  } else {
    b1 |= 127;
    lenBytes = [
      (len >>> 56) & 0xff, (len >>> 48) & 0xff, (len >>> 40) & 0xff, (len >>> 32) & 0xff,
      (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
    ];
  }

  const header = new Uint8Array([b0, b1, ...lenBytes]);
  let mask: Uint8Array;
  if (f.masked) {
    mask = new Uint8Array(4);
    for (let i = 0; i < 4; i++) mask[i] = (Math.random() * 256) & 0xff;
  } else {
    mask = new Uint8Array(0);
  }
  const out = new Uint8Array(header.length + mask.length + f.payload.length);
  out.set(header, 0);
  out.set(mask, header.length);
  if (f.masked) {
    for (let i = 0; i < f.payload.length; i++) out[header.length + 4 + i] = f.payload[i]! ^ mask[i % 4]!;
  } else {
    out.set(f.payload, header.length + mask.length);
  }
  return out;
}

export function decodeWsFrame(buf: Uint8Array): WsFrame {
  if (buf.length < 2) throw new RangeError('ws: too short');
  const b0 = buf[0]!;
  const b1 = buf[1]!;
  const fin = (b0 & 0x80) !== 0;
  const rsv1 = (b0 & 0x40) !== 0;
  const rsv2 = (b0 & 0x20) !== 0;
  const rsv3 = (b0 & 0x10) !== 0;
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < off + 2) throw new RangeError('ws: truncated len');
    len = (buf[off]! << 8) | buf[off + 1]!;
    off += 2;
  } else if (len === 127) {
    if (buf.length < off + 8) throw new RangeError('ws: truncated len64');
    len = 0;
    for (let i = 0; i < 8; i++) len = (len * 256) + buf[off + i]!;
    off += 8;
  }
  let mask: Uint8Array;
  if (masked) {
    if (buf.length < off + 4) throw new RangeError('ws: truncated mask');
    mask = buf.subarray(off, off + 4);
    off += 4;
  } else {
    mask = new Uint8Array(0);
  }
  if (buf.length < off + len) throw new RangeError('ws: truncated payload');
  const payload = new Uint8Array(len);
  for (let i = 0; i < len; i++) payload[i] = buf[off + i]! ^ (masked ? mask[i % 4]! : 0);
  return { fin, rsv1, rsv2, rsv3, opcode, masked, payload };
}

// -----------------------------------------------------------------------------
// NAT — address/port translation table
// -----------------------------------------------------------------------------

export interface NatEntry {
  internalAddr: string;
  internalPort: number;
  externalPort: number;
  /** When this entry expires (epoch seconds). */
  expiresAt: number;
}

export class NatTable {
  private entries = new Map<number, NatEntry>();
  private nextPort = 49152;
  private readonly timeoutSec: number;

  constructor(timeoutSec = 300) {
    this.timeoutSec = timeoutSec;
  }

  /** Allocate an external port for an internal (address, port). */
  translate(internalAddr: string, internalPort: number, nowSec: number): NatEntry {
    this.gc(nowSec);
    for (let p = this.nextPort; p < 65536; p++) {
      if (!this.entries.has(p)) {
        const e: NatEntry = { internalAddr, internalPort, externalPort: p, expiresAt: nowSec + this.timeoutSec };
        this.entries.set(p, e);
        this.nextPort = p + 1;
        return e;
      }
    }
    // wrap
    this.nextPort = 49152;
    for (let p = this.nextPort; p < 65536; p++) {
      if (!this.entries.has(p)) {
        const e: NatEntry = { internalAddr, internalPort, externalPort: p, expiresAt: nowSec + this.timeoutSec };
        this.entries.set(p, e);
        this.nextPort = p + 1;
        return e;
      }
    }
    throw new Error('nat: table full');
  }

  /** Look up an external port back to its internal mapping. */
  reverse(externalPort: number, nowSec: number): NatEntry | undefined {
    const e = this.entries.get(externalPort);
    if (!e) return undefined;
    if (e.expiresAt <= nowSec) {
      this.entries.delete(externalPort);
      return undefined;
    }
    return e;
  }

  private gc(nowSec: number) {
    for (const [p, e] of this.entries) if (e.expiresAt <= nowSec) this.entries.delete(p);
  }
}

// -----------------------------------------------------------------------------
// DHCP (RFC 2131) — message op/htype/hlen/xid/options (subset)
// -----------------------------------------------------------------------------

export interface DhcpMessage {
  op: 1 | 2; // 1=BOOTREQUEST, 2=BOOTREPLY
  htype: 1; // Ethernet
  hlen: number;
  hops: number;
  xid: number;
  secs: number;
  flags: number;
  ciaddr: Uint8Array; // 4 bytes
  yiaddr: Uint8Array; // 4 bytes
  siaddr: Uint8Array; // 4 bytes
  giaddr: Uint8Array; // 4 bytes
  chaddr: Uint8Array; // 16 bytes (6 used for MAC)
  options: Uint8Array; // TLV list, ends with 0xff
}

export const DHCP_OPTIONS = {
  SUBNET_MASK: 1,
  ROUTER: 3,
  DNS: 6,
  HOSTNAME: 12,
  REQUESTED_IP: 50,
  MESSAGE_TYPE: 53,
  SERVER_ID: 54,
  PARAM_REQUEST_LIST: 55,
  END: 255,
} as const;

export const DHCP_MSG_TYPE = {
  DISCOVER: 1,
  OFFER: 2,
  REQUEST: 3,
  ACK: 5,
  NAK: 6,
} as const;

export function encodeDhcp(m: DhcpMessage): Uint8Array {
  if (m.ciaddr.length !== 4) throw new RangeError('ciaddr');
  if (m.yiaddr.length !== 4) throw new RangeError('yiaddr');
  if (m.siaddr.length !== 4) throw new RangeError('siaddr');
  if (m.giaddr.length !== 4) throw new RangeError('giaddr');
  if (m.chaddr.length !== 16) throw new RangeError('chaddr');
  const out = new Uint8Array(300); // DHCP packets are 300 bytes (576 minimum MTU but typically 300)
  out[0] = m.op;
  out[1] = m.htype;
  out[2] = m.hlen;
  out[3] = m.hops;
  out[4] = (m.xid >>> 24) & 0xff;
  out[5] = (m.xid >>> 16) & 0xff;
  out[6] = (m.xid >>> 8) & 0xff;
  out[7] = m.xid & 0xff;
  out[8] = (m.secs >>> 8) & 0xff;
  out[9] = m.secs & 0xff;
  out[10] = (m.flags >>> 8) & 0xff;
  out[11] = m.flags & 0xff;
  out.set(m.ciaddr, 12);
  out.set(m.yiaddr, 16);
  out.set(m.siaddr, 20);
  out.set(m.giaddr, 24);
  out.set(m.chaddr, 28);
  // bytes 44..235 are "sname" and "file" (unused here, leave zero)
  // Magic cookie: 99, 130, 83, 99
  out[236] = 99; out[237] = 130; out[238] = 83; out[239] = 99;
  out.set(m.options, 240);
  return out.subarray(0, 240 + m.options.length);
}

export function decodeDhcp(buf: Uint8Array): DhcpMessage {
  if (buf.length < 240) throw new RangeError('dhcp: too short');
  return {
    op: buf[0]! as 1 | 2,
    htype: buf[1]! as 1,
    hlen: buf[2]!,
    hops: buf[3]!,
    xid: ((buf[4]! << 24) | (buf[5]! << 16) | (buf[6]! << 8) | buf[7]!) >>> 0,
    secs: (buf[8]! << 8) | buf[9]!,
    flags: (buf[10]! << 8) | buf[11]!,
    ciaddr: buf.slice(12, 16),
    yiaddr: buf.slice(16, 20),
    siaddr: buf.slice(20, 24),
    giaddr: buf.slice(24, 28),
    chaddr: buf.slice(28, 44),
    options: buf.subarray(240),
  };
}
