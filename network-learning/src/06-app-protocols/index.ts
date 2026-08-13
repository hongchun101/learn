// =============================================================================
// Chapter 06 — DNS, DHCP, NAT, HTTP, TLS, WebSocket
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
//
// STUDY (read alongside docs/STUDY/ch06-app-protocols.md)
// -----------------------------------------------------------------------------
// Prerequisites: Chapter 02 (varint, length-prefixed) and Chapter 05 (UDP).
// Why it matters: these are the grammars you will read in Wireshark every day
// and write into clients and servers. A senior engineer can read a TLS 1.3
// handshake capture by hand and explain every byte.
// Key invariants:
//   * DNS label compression uses a pointer byte with top 2 bits set; the
//     remaining 14 bits are the offset back into the message.
//   * TLS 1.3 uses `0x0303` in the record header for middlebox compatibility;
//     the actual version is in the `supported_versions` extension.
//   * WebSocket client-to-server frames must be masked; servers must close
//     the connection on an unmasked frame.
//   * HTTP/2 frames carry a 9-byte header (length, type, flags, stream id).
// Common pitfalls:
//   * DNS pointer loops — the implementation must bound the recursion.
//   * Missing the chunked encoding in HTTP/1.1.
//   * Forgetting to mask a WebSocket payload from a client.
//   * Mixing the SNI extension with the certificate CN.
// Interview-ready summary: I can decode a DNS message, walk a DHCP DORA
// exchange, read an HTTP/1.1 request and an HTTP/2 frame, and identify
// every TLS 1.3 record in a capture.
// -----------------------------------------------------------------------------
// Study guide: docs/STUDY/ch06-app-protocols.md
// Test:        tests/ch06-app-protocols.test.ts
// Demo:        npx tsx src/06-app-protocols/demo.ts
// =============================================================================

export {
  encodeDnsMessage, decodeDnsMessage, encodeDnsName, decodeDnsName,
  encodeHttp1Request, decodeHttp1Request, encodeHttp1Response, decodeHttp1Response,
  encodeHttp2Frame, decodeHttp2Frame, HTTP2_FRAME,
  encodeTlsRecord, decodeTlsRecord, TLS_CONTENT_TYPE, TLS_13_HANDSHAKE_TYPE,
  encodeWsFrame, decodeWsFrame, WS_OPCODE,
  NatTable, encodeDhcp, decodeDhcp, DHCP_OPTIONS, DHCP_MSG_TYPE,
} from './app.js';
export type { DnsQuestion, DnsResourceRecord, DnsMessage, HttpRequest, HttpResponse, Http2Frame, TlsRecord, WsFrame, NatEntry, DhcpMessage } from './app.js';
export { demo } from './demo.js';
