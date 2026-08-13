# Chapter 06 — DNS, DHCP, NAT, HTTP, TLS, WebSocket

## Goal

After this chapter you should be able to:

- Decode a DNS message (header + question + answer + opt records).
- Walk a DHCP DORA exchange.
- Sketch a NAT translation table.
- Read an HTTP/1.1 request and response.
- Recognise HTTP/2 frames and TLS 1.3 records.
- Decode a WebSocket frame.

## Prerequisites

Chapter 02 (varint, length-prefixed) and Chapter 05 (UDP).

## Walkthrough

1. **DNS.** `decodeDnsName` handles label compression (RFC 1035 §4.1.4).
   The pointer byte has the top 2 bits set; the remaining 14 bits are
   the offset.
2. **HTTP/1.1.** `encodeHttp1Request`/`decodeHttp1Request` and the
   response counterpart. The request line is `METHOD SP URI SP HTTP/1.1\r\n`.
3. **HTTP/2.** `encodeHttp2Frame` writes the 9-byte header
   (length, type, flags, stream id).
4. **TLS 1.3.** `encodeTlsRecord` writes the 5-byte record header
   (type, version, length); the body is a handshake message.
5. **WebSocket.** `encodeWsFrame` writes the 2-byte base header,
   optionally a 64-bit payload length, and then the payload.
6. **NAT.** `NatTable` is a minimal source-NAT (with port) and
   destination-NAT implementation.
7. **DHCP.** `encodeDhcp`/`decodeDhcp` cover the DORA flow.

Run `npx tsx src/06-app-protocols/demo.ts` to see real bytes.

## Exercises

1. **DNS compression.** Encode the name `a.b.example.com` and a
   second name `a.b.example.com` that uses compression. Compare.
2. **HTTP/1.1.** Encode `GET / HTTP/1.1` with `Host: example.com`.
3. **HTTP/2.** Encode a HEADERS frame with end-headers set.
4. **TLS.** Encode a TLS 1.3 record carrying a ClientHello.
5. **WebSocket.** Encode a text frame with payload `hello`.

### Answers (sketch)

1. The first name is fully expanded; the second uses a pointer to
   the suffix.
2. Bytes: `47 45 54 20 2f 20 48 54 54 50 2f 31 2e 31 0d 0a ...`.
3. HEADERS frame, type 0x1, flag 0x4.
4. Content type 0x16 (handshake), version 0x0303 (TLS 1.0 record
   layer; TLS 1.3 uses 0x0303 for compatibility).
5. FIN + opcode 1 (text); payload `hello`.

## Common pitfalls

- **DNS pointer cycles.** A malformed file can have a pointer loop.
  The implementation must bound the recursion.
- **HTTP/1.1 chunked encoding.** The chapter does not cover it; if
  you need it, add `Transfer-Encoding: chunked` parsing.
- **TLS record version.** TLS 1.3 uses `0x0303` in the record header
  for middlebox compatibility, but the supported_versions
  extension carries `0x0304`.
- **WebSocket masking.** Client-to-server frames must be masked.
  Servers must close the connection if a frame is unmasked.

## Interview questions

1. **Why DNS uses port 53?** Historical; UDP/TCP both port 53.
2. **How does DNS work with UDP for large answers?** Truncation +
   retry over TCP.
3. **What's the difference between HTTP/1.1 keep-alive and HTTP/2
   streams?** HTTP/1.1 keep-alive is per-connection, head-of-line
   blocking. HTTP/2 multiplexes many streams over one connection.
4. **Why does TLS 1.3 hide the certificate?** SNI and certificate
   data leak which site you visit. Encrypted ClientHello (ECH) is
   still in flight.
5. **How does WebSocket frame parsing differ from HTTP?** WebSocket
   uses a 2-byte header, an optional 64-bit length, and an optional
   32-bit masking key.

## What to build

A `miniResolver` that takes a domain and walks a tiny zone file
(question → answer via label compression). Then a `miniProxy`
that does a CONNECT-then-GET.

## References

- RFC 1035 (DNS).
- RFC 2131 (DHCP).
- RFC 8446 (TLS 1.3).
- RFC 6455 (WebSocket).
- RFC 9110 (HTTP semantics).
- RFC 9113 (HTTP/2).
