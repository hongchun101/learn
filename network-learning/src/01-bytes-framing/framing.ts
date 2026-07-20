// =============================================================================
// Chapter 01 — Framing
// =============================================================================
// Goal: a "frame" is a self-delimiting unit on a byte stream. Every protocol
// that runs over a byte-oriented transport (TCP, serial, TTY, WebSocket) has
// to pick one. The three canonical families are:
//
//   1) Length-prefixed — write a fixed-width or varint length, then payload.
//      Used by: TLS record, HTTP/2, gRPC, Protobuf, Kafka, RESP3, Cap'n Proto.
//   2) Delimiter-based — pick a sentinel byte that cannot appear in payload
//      (escape it in the body, or constrain the body — e.g. US-ASCII / lines).
//      Used by: HTTP/1.1, SMTP, IRC, line-based log streams.
//   3) Self-synchronizing — encoded such that the boundary is detectable
//      without out-of-band length. Examples: COBS, SLIP, HDLC bit-stuffing,
//      Protocol Buffers' tag-delimited wire format.
//
// We implement the first two byte-wise and a tiny COBS encoder/decoder.
// =============================================================================

/** Maximum length that fits in one byte; used to validate u8 length prefixes. */
export const MAX_U8_LEN = 0xff;
/** Maximum length that fits in two bytes (little- or big-endian u16). */
export const MAX_U16_LEN = 0xffff;
/** Maximum length that fits in four bytes. */
export const MAX_U32_LEN = 0xffffffff;

/**
 * Encode a payload as a u8 length-prefixed frame.
 *   [len:u8][payload:bytes]
 * Throws if `payload.length > 0xff`.
 */
export function encodeU8Frame(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_U8_LEN) {
    throw new RangeError(`payload length ${payload.length} exceeds u8 max`);
  }
  const out = new Uint8Array(1 + payload.length);
  out[0] = payload.length;
  out.set(payload, 1);
  return out;
}

/** Decode a single u8-prefixed frame at the start of `buf`. Returns [payload, consumed]. */
export function decodeU8Frame(buf: Uint8Array): { payload: Uint8Array; consumed: number } {
  if (buf.length < 1) throw new RangeError('buffer too short for u8 length');
  const len = buf[0]!;
  if (buf.length < 1 + len) throw new RangeError('buffer truncated: u8 length exceeds buffer');
  return { payload: buf.subarray(1, 1 + len), consumed: 1 + len };
}

/**
 * Encode as a u16 big-endian length-prefixed frame.
 *   [len:u16 BE][payload:bytes]
 */
export function encodeU16BeFrame(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_U16_LEN) {
    throw new RangeError(`payload length ${payload.length} exceeds u16 max`);
  }
  const out = new Uint8Array(2 + payload.length);
  out[0] = (payload.length >>> 8) & 0xff;
  out[1] = payload.length & 0xff;
  out.set(payload, 2);
  return out;
}

/** Decode a u16 big-endian length-prefixed frame. */
export function decodeU16BeFrame(buf: Uint8Array): { payload: Uint8Array; consumed: number } {
  if (buf.length < 2) throw new RangeError('buffer too short for u16 length');
  const len = (buf[0]! << 8) | buf[1]!;
  if (buf.length < 2 + len) throw new RangeError('buffer truncated: u16 length exceeds buffer');
  return { payload: buf.subarray(2, 2 + len), consumed: 2 + len };
}

/**
 * Encode as a u32 little-endian length-prefixed frame.
 *   [len:u32 LE][payload:bytes]
 * Common in: Protobuf (varint), RESP3, ZMTP, modern binary RPC.
 */
export function encodeU32LeFrame(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_U32_LEN) {
    throw new RangeError(`payload length ${payload.length} exceeds u32 max`);
  }
  const out = new Uint8Array(4 + payload.length);
  new DataView(out.buffer).setUint32(0, payload.length, true /* little-endian */);
  out.set(payload, 4);
  return out;
}

/** Decode a u32 little-endian length-prefixed frame. */
export function decodeU32LeFrame(buf: Uint8Array): { payload: Uint8Array; consumed: number } {
  if (buf.length < 4) throw new RangeError('buffer too short for u32 length');
  const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, true);
  if (buf.length < 4 + len) throw new RangeError('buffer truncated: u32 length exceeds buffer');
  return { payload: buf.subarray(4, 4 + len), consumed: 4 + len };
}

/**
 * Sentinel byte used to delimit frames. In delimiter-based protocols the
 * payload is also restricted (e.g. printable ASCII lines), so the sentinel
 * can never appear in the payload. Here we let the caller provide any byte.
 */
export const DEFAULT_DELIM = 0x0a; // '\n', used by HTTP/1.1 line endings

/**
 * Split a buffer on a single-byte delimiter. Returns each frame including the
 * terminating delimiter (so callers can verify the boundary) except the final
 * one if it had no terminator (incomplete frame).
 */
export function splitOnDelim(buf: Uint8Array, delim: number = DEFAULT_DELIM): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === delim) {
      out.push(buf.subarray(start, i + 1));
      start = i + 1;
    }
  }
  if (start < buf.length) out.push(buf.subarray(start));
  return out;
}

/**
 * Append a delimiter to a payload. If the payload already contains the
 * delimiter, this is a strict violation for line-based protocols — the caller
 * is responsible for rejecting such input upstream.
 */
export function withDelim(payload: Uint8Array, delim: number = DEFAULT_DELIM): Uint8Array {
  const out = new Uint8Array(payload.length + 1);
  out.set(payload, 0);
  out[payload.length] = delim;
  return out;
}

// -----------------------------------------------------------------------------
// COBS — Consistent Overhead Byte Stuffing
// -----------------------------------------------------------------------------
// A self-synchronizing framing that guarantees:
//   * No zero bytes appear in the encoded frame (so 0x00 can be the sentinel).
//   * Overhead is at most ceil(payload.length / 254) + 1 bytes (≈ 0.4%).
//   * The decoder can re-sync after corruption within 1 byte of the bad spot.
//
// Used in: embedded sensor protocols, ROM bootloader protocols, BACnet, etc.
// -----------------------------------------------------------------------------

/**
 * Encode `data` with COBS, producing a frame that contains no zero bytes and
 * ends with a single zero (the sentinel).
 */
export function cobsEncode(data: Uint8Array): Uint8Array {
  if (data.length === 0) return new Uint8Array([0x01, 0x00]);

  const out: number[] = [];
  let codeIndex = 0;
  out.push(0); // placeholder for the first code byte
  let code = 1;
  let i = 0;

  while (i < data.length) {
    if (data[i] === 0) {
      out[codeIndex] = code;
      codeIndex = out.length;
      out.push(0); // next code byte placeholder
      code = 1;
      i++;
    } else {
      out.push(data[i]!);
      code++;
      i++;
      if (code === 0xff) {
        out[codeIndex] = code;
        codeIndex = out.length;
        out.push(0);
        code = 1;
      }
    }
  }
  out[codeIndex] = code;
  out.push(0x00); // sentinel
  return new Uint8Array(out);
}

/**
 * Decode a COBS-encoded frame. The frame must end with a zero byte. Returns
 * the decoded payload.
 */
export function cobsDecode(frame: Uint8Array): Uint8Array {
  if (frame.length === 0) throw new Error('cobs: empty frame');
  if (frame[frame.length - 1] !== 0x00) throw new Error('cobs: frame must end with 0x00 sentinel');

  // Strip trailing sentinel.
  const data = frame.subarray(0, frame.length - 1);
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const code = data[i]!;
    if (code === 0) throw new Error('cobs: zero code byte in encoded frame');
    for (let j = 1; j < code && i + j < data.length; j++) {
      out.push(data[i + j]!);
    }
    if (code < 0xff && i + code < data.length) {
      out.push(0);
    }
    i += code;
  }
  return new Uint8Array(out);
}
